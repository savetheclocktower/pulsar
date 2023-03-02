const Parser = require('web-tree-sitter');
const ScopeDescriptor = require('./scope-descriptor')
const fs = require('fs');
const { Point, Range } = require('text-buffer');
const { Emitter } = require('event-kit');

const initPromise = Parser.init()
const createTree = require("./rb-tree")

class PositionIndex {
  constructor () {
    this.map = new Map
    // TODO: It probably doesn't actually matter what order these are visited
    // in.
    this.order = []
    this.rangeData = new Map
  }

  _normalizePoint (point) {
    return `${point.row},${point.column}`
  }

  _normalizeRange (syntax) {
    let { startPosition, endPosition } = syntax.node;
    return `${this._normalizePoint(startPosition)}/${this._normalizePoint(endPosition)}`
  }

  _keyToObject (key) {
    let [row, column] = key.split(',');
    return { row: Number(row), column: Number(column) }
  }

  setDataForRange (syntax, props) {
    let key = this._normalizeRange(syntax);
    return this.rangeData.set(key, props);
  }

  getDataForRange (syntax) {
    let key = this._normalizeRange(syntax);
    return this.rangeData.get(key);
  }

  store (syntax, id) {
    let {
      node: {
        startPosition: start,
        endPosition: end,
      },
      setProperties: props
    } = syntax;

    let data = this.getDataForRange(syntax);
    if (data && data.final) {
      // A previous rule covering this exact range marked itself as "final." We
      // should not add an additional scope.
      return;
    } else if (props) {
      this.setDataForRange(syntax, props);
    }

    // We should open this scope at `start`.
    this.set(start, id, 'open');

    // We should close this scope at `end`.
    this.set(end, id, 'close');
  }

  set (point, item, which) {
    let key = this._normalizePoint(point)
    if (!this.order.includes(key)) {
      this.order.push(key);
    }
    if (!this.map.has(key)) {
      this.map.set(key, { open: [], close: [] })
    }
    let bundle = this.map.get(key)[which];

    if (which === 'open') {
      // TODO: For now, assume that if two tokens both open at (X, Y), the one
      // that spans a greater distance in the buffer will be encountered first.
      // If that's not true, this logic will need to be more complex.

      // If an earlier token has already opened at this point, we want to open
      // after it.
      bundle.push(item)
    } else {
      // If an earlier token has already closed at this point, we want to close
      // before it.
      bundle.unshift(item)
    }
  }

  get (point) {
    let key = this._normalizePoint(point)
    return this.map.get(key)
  }

  clear () {
    this.map.clear()
    this.rangeData.clear()
    this.order = []
  }

  *[Symbol.iterator] () {
    for (let key of this.order) {
      let point = this._keyToObject(key);
      yield [point, this.map.get(key)]
    }
  }
}

const VAR_ID = 257
class WASMTreeSitterLanguageMode {
  constructor(buffer, config, grammar) {
    this.emitter = new Emitter();
    this.lastId = 259
    this.scopeNames = new Map([["variable", VAR_ID]])
    this.scopeIds = new Map([[VAR_ID, "variable"]])
    this.buffer = buffer
    this.config = config
    this.injectionsMarkerLayer = buffer.addMarkerLayer();
    this.newRanges = []
    this.oldNodeTexts = new Set()
    let resolve
    this.ready = new Promise(r => resolve = r)
    this.grammar = grammar

    initPromise.then(() =>
      Parser.Language.load(grammar.grammarPath)
    ).then(lang => {
      this.syntaxQuery = lang.query(grammar.syntaxQuery)
      if (grammar.localsQuery) {
        // TEMP: Disabled the locals query for now because it was very
        // confusing to have a second thing applying scopes.
        // this.localsQuery = lang.query(grammar.localsQuery)
      }
      this.grammar = grammar
      if (grammar.foldsQuery) {
        this.foldsQuery = lang.query(grammar.foldsQuery)
      }
      this.parser = new Parser()
      this.parser.setLanguage(lang)

      // Force first highlight
      this.boundaries = createTree(comparePoints)
      // const startRange = new Range([0, 0], [0, 0])
      const range = buffer.getRange()
      this.tree = this.parser.parse(buffer.getText())
      this.emitter.emit('did-change-highlighting', range)
      resolve(true)
    })

    this.rootScopeDescriptor = new ScopeDescriptor({
      scopes: [grammar.scopeName]
    });
  }

  // A hack to force an existing buffer to react to an update in the SCM file.
  _reloadSyntaxQuery () {
    // let _oldSyntaxQuery = this.syntaxQuery;
    this.grammar._reloadQueryFiles()
    let lang = this.parser.getLanguage()
    this.syntaxQuery = lang.query(this.grammar.syntaxQuery)
    // let range = this.buffer.getRange()
    // this._updateSyntax(range.start, range.end)
    // Force first highlight
    this.boundaries = createTree(comparePoints)
    // const startRange = new Range([0, 0], [0, 0])
    const range = this.buffer.getRange()
    this.tree = this.parser.parse(this.buffer.getText())
    this.emitter.emit('did-change-highlighting', range)
  }

  getGrammar() {
    return this.grammar
  }

  updateForInjection(...args) {
  }

  onDidChangeHighlighting(callback) {
    return this.emitter.on('did-change-highlighting', callback)
  }

  tokenizedLineForRow(row) {
  }

  getScopeChain(...args) {
    console.log("getScopeChain", args)
  }

  bufferDidChange(change) {
    if (!this.tree) { return; }

    this.newRanges.push(change.newRange)
    const possibleDefinition = this.boundaries.lt(change.oldRange.end).value?.definition
    if (possibleDefinition) {
      this.oldNodeTexts.add(possibleDefinition)
    }

    const startIndex = this.buffer.characterIndexForPosition(change.newRange.start)
    this.tree.edit({
      startPosition: change.newRange.start,
      oldEndPosition: change.oldRange.end,
      newEndPosition: change.newRange.end,
      startIndex: startIndex,
      oldEndIndex: startIndex + change.oldText.length,
      newEndIndex: this.buffer.characterIndexForPosition(change.newRange.end)
    })
    const newTree = this.parser.parse(this.buffer.getText(), this.tree)
    this.tree = newTree
  }

  _updateBoundaries(from, to) {
    this._updateSyntax(from, to)

    if (this.localsQuery) {
      const locals = this.localsQuery.captures(this.tree.rootNode, from, to)
      this._updateWithLocals(locals)
      this._prepareInvalidations()
    }
  }

  _updateSyntax(from, to) {
    const syntax = this.syntaxQuery.captures(this.tree.rootNode, from, to)
    let oldDataIterator = this.boundaries.ge(from)
    let oldScopes = []

    // Remove all boundaries data for the given range.
    while (oldDataIterator.hasNext && comparePoints(oldDataIterator.key, to) <= 0 ) {
      this.boundaries = this.boundaries.remove(oldDataIterator.key)
      oldScopes = oldDataIterator.value.closeScopeIds

      oldDataIterator.next()
      // TODO: Doesn't this mean that we'll miss the last item in the iterator
      // under certain circumstances?
    }

    // TODO: Still don't quite understand this; need to revisit.
    oldScopes = oldScopes || []


    if (!this.positionIndex) {
      this.positionIndex = new PositionIndex();
    }
    this.positionIndex.clear()

    syntax.forEach((s) => {
      let { name } = s
      let id = this.findOrCreateScopeId(name)

      // PositionIndex takes all our syntax tokens and consolidates them into a
      // fixed set of boundaries to visit in order. If a token has data, it
      // sets that data so that a later token for the same range can read it.
      this.positionIndex.store(s, id)
    });

    // TODO: I turned this into two loops just so I could reason about it more
    // easily, but this can probably go back to one loop in the future once
    // it's proven to work.
    //
    // I have not retained the `openNode` and `closeNode` metadata that you
    // probably need for the locals query, but we can put that back when we're
    // able.
    for (let [point, scopes] of this.positionIndex) {
      let bundle = {
        closeScopeIds: [...scopes.close],
        openScopeIds: [...scopes.open],
        position: point
      }
      this.boundaries = this.boundaries.insert(point, bundle)
    }

    // syntax.forEach(({ node, name }) => {
    //   // let id = this.scopeNames.get(name)
    //   // console.log(' handling node:', name, node);
    //   // if (!id) {
    //   //   this.lastId += 2
    //   //   id = this.lastId
    //   //   const newId = this.lastId;
    //   //   this.scopeNames.set(name, newId)
    //   //   this.scopeIds.set(newId, name)
    //   // }
    //   let id = this.findOrCreateScopeId(name)
    //   let old = this.boundaries.get(node.startPosition)
    //   if (old) {
    //     // console.log(' found node:', this.scopeForId(id));
    //     old.openNode = node
    //     if (old.openScopeIds.length === 0) {
    //       old.openScopeIds = [id]
    //     }
    //   } else {
    //     let bundle = {
    //       closeScopeIds: [...oldScopes],
    //       openScopeIds: [id],
    //       openNode: node,
    //       position: node.startPosition
    //     }
    //     console.log('inserting close', s(bundle.closeScopeIds), 'open', s(bundle.openScopeIds), 'at', node.startPosition);
    //     this.boundaries = this.boundaries.insert(node.startPosition, bundle)
    //     oldScopes = [id]
    //   }
    //
    //   old = this.boundaries.get(node.endPosition)
    //   if (old) {
    //     old.closeNode = node
    //     if (old.closeScopeIds.length === 0) {
    //       old.closeScopeIds = [id]
    //     }
    //   } else {
    //     this.boundaries = this.boundaries.insert(node.endPosition, {
    //       closeScopeIds: [id],
    //       openScopeIds: [],
    //       closeNode: node,
    //       position: node.endPosition
    //     })
    //   }
    // })

    this.boundaries = this.boundaries.insert(Point.INFINITY, {
      closeScopeIds: [...oldScopes],
      openScopeIds: [],
      position: Point.INFINITY
    })
  }

  _prepareInvalidations() {
    let nodes = this.oldNodeTexts
    let parentScopes = createTree(comparePoints)

    this.newRanges.forEach(range => {
      const newNodeText = this.boundaries.lt(range.end).value?.definition
      if (newNodeText) nodes.add(newNodeText)
      const parent = findNodeInCurrentScope(
        this.boundaries, range.start, v => v.scope === 'open'
      )
      if (parent) {
        parentScopes = parentScopes.insert(parent.position, parent)
      }
    })

    parentScopes.forEach((_, val) => {
      const from = val.position, to = val.closeScopeNode.position
      const range = new Range(from, to)
      this._invalidateReferences(range, nodes)
    })
    this.oldNodeTexts = new Set()
    this.newRanges = []
  }

  _invalidateReferences(range, invalidatedNames) {
    const {start, end} = range
    let it = this.boundaries.ge(start)
    while (it.hasNext) {
      const node = it.value.openNode
      if (node && !it.value.definition) {
        const txt = node.text
        if (invalidatedNames.has(txt)) {
          const range = new Range(node.startPosition, node.endPosition)
          this.emitter.emit('did-change-highlighting', range)
        }
      }
      it.next()
      if (comparePoints(it.key, end) >= 0) { return }
    }
  }

  _updateWithLocals(locals) {
    const size = locals.length
    for (let i = 0; i < size; i++) {
      const {name, node} = locals[i]
      const nextOne = locals[i+1]

      const duplicatedLocalScope = nextOne &&
        comparePoints(node.startPosition, nextOne.node.startPosition) === 0 &&
        comparePoints(node.endPosition, nextOne.node.endPosition) === 0
      if (duplicatedLocalScope) {
        // Local reference have lower precedence over everything else
        if (name === 'local.reference') continue;
      }

      let openNode = this._getOrInsert(node.startPosition, node)
      if (!openNode.openNode) openNode.openNode = node
      let closeNode = this._getOrInsert(node.endPosition, node)
      if (!closeNode.closeNode) closeNode.closeNode = node

      if (name === "local.scope") {
        openNode.scope = "open"
        closeNode.scope = "close"
        openNode.closeScopeNode = closeNode
        closeNode.openScopeNode = openNode
        const parentNode = findNodeInCurrentScope(
          this.boundaries, node.startPosition, v => v.scope === 'open')
        const depth = parentNode?.depth || 0
        openNode.depth = depth + 1
        closeNode.depth = depth + 1
      } else if (name === "local.reference" && !openNode.definition) {
        const varName = node.text
        const varScope = findNodeInCurrentScope(
          this.boundaries, node.startPosition, v => v.definition === varName)
        if (varScope) {
          openNode.openScopeIds = varScope.openScopeIds
          closeNode.closeScopeIds = varScope.closeDefinition.closeScopeIds
        }
      } else if (name === "local.definition") {
        const shouldAddVarToScopes = openNode.openScopeIds.indexOf(VAR_ID) === -1
        if (shouldAddVarToScopes) {
          openNode.openScopeIds = [...openNode.openScopeIds, VAR_ID]
          closeNode.closeScopeIds = [VAR_ID, ...closeNode.closeScopeIds]
        }

        openNode.definition = node.text
        openNode.closeDefinition = closeNode
      }
    }
  }

  _getOrInsert(key) {
    const existing = this.boundaries.get(key)
    if (existing) {
      return existing
    } else {
      const obj = {openScopeIds: [], closeScopeIds: [], position: key}
      this.boundaries = this.boundaries.insert(key, obj)
      return obj
    }
  }

  bufferDidFinishTransaction (...args) {
  }

  buildHighlightIterator () {
    if (!this.parser) return nullIterator;
    let iterator// = boundaries.ge({row: 0, column: 0})
    const updateBoundaries = (start, end) => {
      this._updateBoundaries(start, end)
      return this.boundaries
    }

    return {
      getOpenScopeIds () {
        return [...new Set(iterator.value.openScopeIds)]
      },

      getCloseScopeIds () {
        return [...new Set(iterator.value.closeScopeIds)]
      },

      getPosition () {
        return (iterator.value && iterator.value.position) || Point.INFINITY
      },

      moveToSuccessor () {
        return iterator.next()
      },

      seek (start, endRow) {
        const end = {row: endRow + 1, column: 0}
        iterator = updateBoundaries(start, end).ge(start)
        return []
      }
    }
  }

  classNameForScopeId (scopeId) {
    const scope = this.scopeIds.get(scopeId)
    if (scope) {
      return `syntax--${scope.replace(/\./g, ' syntax--')}`
    }
  }

  scopeForId (scopeId) {
    return this.scopeIds.get(scopeId)
  }

  findOrCreateScopeId (name) {
    let id = this.scopeNames.get(name)
    if (!id) {
      this.lastId += 2
      id = this.lastId
      const newId = this.lastId;
      this.scopeNames.set(name, newId)
      this.scopeIds.set(newId, name)
    }
    return id
  }

  // TODO: Doesn't work right; need to use `this.tree` instead of
  // `this.syntaxQuery`.
  syntaxTreeScopeDescriptorForPosition(point) {
    point = this.buffer.clipPosition(Point.fromObject(point));

    // If the position is the end of a line, get node of left character instead of newline
    // This is to match TextMate behaviour, see https://github.com/atom/atom/issues/18463
    if (
      point.column > 0 &&
      point.column === this.buffer.lineLengthForRow(point.row)
    ) {
      point = point.copy();
      point.column--;
    }

    let scopes = [];

    let root = this.tree.rootNode;
    let rangeIncludesPoint = (start, end, point) => {
      return comparePoints(start, point) <= 0 && comparePoints(end, point) >= 0
    };

    let iterate = (node, isAnonymous = false) => {
      let { startPosition: start, endPosition: end } = node;
      if (rangeIncludesPoint(start, end, point)) {
        scopes.push(isAnonymous ? `"${node.type}"` : node.type);
        let namedChildrenIds = node.namedChildren.map(c => c.typeId);
        for (let child of node.children) {
          let isAnonymous = !namedChildrenIds.includes(child.typeId);
          iterate(child, isAnonymous);
        }
      }
    };

    iterate(root);

    scopes.unshift(this.grammar.scopeName);
    return new ScopeDescriptor({ scopes });
  }

  // TODO: When the cursor is at the very end of the line, before the newline,
  // it should include the scopes that ended on the left side of the cursor.
  scopeDescriptorForPosition (point) {
    // If the position is the end of a line, get scope of left character instead of newline
    // This is to match TextMate behaviour, see https://github.com/atom/atom/issues/18463
    if (
      point.column > 0 &&
      point.column === this.buffer.lineLengthForRow(point.row)
    ) {
      point = point.copy();
      point.column--;
    }

    if (!this.tree) {
      return new ScopeDescriptor({scopes: ['text']})
    }
    const current = Point.fromObject(point, true)
    let begin = Point.fromObject(point, true)
    begin.column = 0

    const end = Point.fromObject([begin.row + 1, 0])
    this._updateBoundaries(begin, end)

    // Start at the beginning.
    const it = this.boundaries.ge(new Point(0, 0))
    if (!it.value) {
      return new ScopeDescriptor({scopes: ['text']})
    }

    let scopeIds = []
    while (comparePoints(it.key, current) <= 0) {
      const closing = new Set(it.value.closeScopeIds)
      scopeIds = scopeIds.filter(s => !closing.has(s))
      scopeIds.push(...it.value.openScopeIds)
      if (!it.hasNext) { break }
      it.next()
    }

    const scopes = scopeIds.map(id => this.scopeForId(id))

    if (scopes.length === 0 || scopes[0] !== this.grammar.scopeName) {
      scopes.unshift(this.grammar.scopeName);
    }
    return new ScopeDescriptor({scopes})
  }

  getFoldableRanges() {
    if (!this.tree) return [];
    const folds = this.foldsQuery.captures(this.tree.rootNode)
    return folds.map(fold => this._makeFoldableRange(fold.node))
  }

  getFoldableRangesAtIndentLevel(level) {
    const tabLength = this.buffer.displayLayers[0]?.tabLength || 2
    const minCol = (level-1) * tabLength
    const maxCol = (level) * tabLength
    if (!this.tree) return [];
    return this.foldsQuery
      .captures(this.tree.rootNode)
      .filter(fold => {
        const {column} = fold.node.startPosition
        return column > minCol && column <= maxCol
      })
      .map(fold => this._makeFoldableRange(fold.node))
  }

  indentLevelForLine(line, tabLength) {
    let indentLength = 0;
    for (let i = 0, { length } = line; i < length; i++) {
      const char = line[i];
      if (char === '\t') {
        indentLength += tabLength - (indentLength % tabLength);
      } else if (char === ' ') {
        indentLength++;
      } else {
        break;
      }
    }
    return indentLength / tabLength;
  }

  // eslint-disable-next-line no-unused-vars
  getFoldableRangeContainingPoint(point, tabLength) {
    const foldsAtRow = this._getFoldsAtRow(point.row)
    const node = foldsAtRow[0]?.node
    if (node) {
      return this._makeFoldableRange(node)
    }
  }

  _makeFoldableRange(node) {
    const children = node.children
    const lastNode = children[children.length-1]
    const range = new Range([node.startPosition.row, Infinity], lastNode.startPosition)
    return range
  }

  isFoldableAtRow(row) {
    const foldsAtRow = this._getFoldsAtRow(row)
    return foldsAtRow.length !== 0
  }

  _getFoldsAtRow(row) {
    if (!this.tree) return []
    const folds = this.foldsQuery.captures(this.tree.rootNode,
      {row: row, column: 0}, {row: row+1, column: 0})
    return folds.filter(fold => fold.node.startPosition.row === row)
  }
}
module.exports = WASMTreeSitterLanguageMode;

const nullIterator = {
  seek: () => [],
  compare: () => 1,
  moveToSuccessor: () => {},
  getPosition: () => Point.INFINITY,
  getOpenScopeIds: () => [],
  getCloseScopeIds: () => []
}

function findNodeInCurrentScope(boundaries, position, filter) {
  let iterator = boundaries.ge(position)
  while (iterator.hasPrev) {
    iterator.prev()
    const value = iterator.value
    if (filter(value)) return value

    if (value.scope === 'close') {
      // If we have a closing scope, there's an "inner scope" that we will
      // ignore, and move the iterator BEFORE the inner scope position
      iterator = boundaries.lt(value.openScopeNode.position)
    } else if (value.scope === 'open') {
      // But, if we find an "open" scope, we check depth. If it's `1`, we
      // got into the last nested scope we were inside, so it's time to quit
      if (value.depth === 1) return
    }
  }
}

function comparePoints(a, b) {
  const rows = a.row - b.row
  if (rows === 0) {
    return a.column - b.column
  } else {
    return rows
  }
}

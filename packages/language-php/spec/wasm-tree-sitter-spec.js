const {toHaveScopes, setPhpText} = require('./tree-sitter-helpers')

describe("Tree-sitter PHP grammar", () => {
  var editor;

  beforeEach(async () => {
    atom.config.set("core.useTreeSitterParsers", true);
    atom.config.set("core.useExperimentalModernTreeSitter", true);
    await atom.packages.activatePackage("language-php");
    editor = await atom.workspace.open("foo.php");
    editor.setPhpText = setPhpText;
  });

  beforeEach(function () {
    this.addMatchers({toHaveScopes});
  });

  describe("loading the grammars", () => {
    it('loads the wrapper "HTML" grammar', () => {
      embeddingGrammar = atom.grammars.grammarForScopeName("text.html.php");
      expect(embeddingGrammar).toBeTruthy();
      expect(embeddingGrammar.scopeName).toBe("text.html.php");
      expect(embeddingGrammar.constructor.name).toBe("WASMTreeSitterGrammar");

      // injections
      expect(embeddingGrammar.injectionPointsByType.program).toBeTruthy();
      expect(embeddingGrammar.injectionPointsByType.comment).toBeTruthy();
    })
  });

  describe('php tags', () => {
    it('scopes regular opening tags', async () => {
        await editor.setPhpText('');

        expect(editor).toHaveScopes([0, 0], '<?php', ['punctuation.section.embedded.begin.php']);
    })

    it('scopes short opening tags', async () => {
        editor.setText('<?= ?>');
        await editor.languageMode.ready;

        expect(editor).toHaveScopes([0, 0], '<?=', ['punctuation.section.embedded.begin.php']);
    })

    it('scopes closing tags', async () => {
        await editor.setPhpText('?>');

        expect(editor).toHaveScopes([1, 0], '?>', ['punctuation.section.embedded.end.php']);
    })
  });

  describe("operators", () => {
    it("scopes =", async () => {
      await editor.setPhpText('$test = 1;');

      expect(editor).toHaveScopes([1, 0], '$', ["variable.other.php", "punctuation.definition.variable.php"]);
      expect(editor).toHaveScopes([1, 5], ' ', []);
      expect(editor).toHaveScopes([1, 6], '=', ["keyword.operator.assignment.php"]);
      expect(editor).toHaveScopes([1, 8], '1', ["constant.numeric.decimal.integer.php"]);
    });

    it("scopes +", async () => {
      await editor.setPhpText('1 + 2;');

      expect(editor).toHaveScopes([1, 0], '1', ["constant.numeric.decimal.integer.php"]);
      expect(editor).toHaveScopes([1, 2], '+', ["keyword.operator.arithmetic.php"]);
      expect(editor).toHaveScopes([1, 4], '2', ["constant.numeric.decimal.integer.php"]);
    });

    it("scopes %", async () => {
      await editor.setPhpText('1 % 2;');

      expect(editor).toHaveScopes([1, 0], '1', ["constant.numeric.decimal.integer.php"]);
      expect(editor).toHaveScopes([1, 2], '%', ["keyword.operator.arithmetic.php"]);
      expect(editor).toHaveScopes([1, 4], '2', ["constant.numeric.decimal.integer.php"]);
    });

    it("scopes instanceof", async () => {
      await editor.setPhpText('$x instanceof Foo;');

      expect(editor).toHaveScopes([1, 0],  '$',          ["variable.other.php", "punctuation.definition.variable.php"]);
      expect(editor).toHaveScopes([1, 1],  'x',          ["variable.other.php"]);
      expect(editor).toHaveScopes([1, 3],  'instanceof', ["keyword.operator.type.php"]);
      expect(editor).toHaveScopes([1, 14], 'Foo',        ["support.other.function.constructor.php"]);
    });

    describe("combined operators", () => {
      it("scopes ===", async () => {
        await editor.setPhpText('$test === 2;');

        expect(editor).toHaveScopes([1, 6], ["keyword.operator.comparison.php"]);
      });

      it("scopes +=", async () => {
        await editor.setPhpText('$test += 2;');

        expect(editor).toHaveScopes([1, 6], ["keyword.operator.assignment.compound.php"]);
      });

      it("scopes ??=", async () => {
        await editor.setPhpText('$test ??= true;');

        expect(editor).toHaveScopes([1, 6], ["keyword.operator.assignment.compound.php"]);
      });
    });
  });

  it("scopes $this", async () => {
    await editor.setPhpText("$this;");

    expect(editor).toHaveScopes([1, 0], '$',    ["variable.language.builtin.this.php", "punctuation.definition.variable.php"]);
    expect(editor).toHaveScopes([1, 1], 'this', ["variable.language.builtin.this.php"]);

    await editor.setPhpText("$thistles;");

    expect(editor).toHaveScopes([1, 0], '$',        ["variable.other.php", "punctuation.definition.variable.php"]);
    expect(editor).toHaveScopes([1, 1], 'thistles', ["variable.other.php"]);
  });

  describe("use declarations", () => {
    it("scopes basic use statements", async () => {
      await editor.setPhpText("use Foo;");

      expect(editor).toHaveScopes([1, 0], 'use', ["keyword.control.use.php"]);
      expect(editor).toHaveScopes([1, 4], 'Foo', ["entity.name.type.namespace.php"]);

      await editor.setPhpText("use My\\Full\\NSname;");

      expect(editor).toHaveScopes([1, 0], 'use', ["keyword.control.use.php"]);
      expect(editor).toHaveScopes([1, 4], 'My', ["entity.name.type.namespace.php"]);
      expect(editor).toHaveScopes([1, 6], '\\', ["punctuation.operator.namespace.php"]);
      expect(editor).toHaveScopes([1, 7], 'Full', ["entity.name.type.namespace.php"]);
      expect(editor).toHaveScopes([1, 11], '\\', ["punctuation.operator.namespace.php"]);
      expect(editor).toHaveScopes([1, 12], 'NSname', ["entity.name.type.namespace.php"]);
    });
  });

  describe("classes", () => {
    it("scopes class declarations", async () => {
      await editor.setPhpText("class Test {}");

      expect(editor).toHaveScopes([1,  0], 'class', ["storage.type.class.php"]);
      expect(editor).toHaveScopes([1,  6], 'Test',  ["entity.name.type.class.php"]);
      expect(editor).toHaveScopes([1, 11], '{',     ['punctuation.definition.block.begin.bracket.curly.php']);
      expect(editor).toHaveScopes([1, 12], '}',     ['punctuation.definition.block.end.bracket.curly.php']);
    });

    it("scopes class instantiation", async () => {
      await editor.setPhpText("$a = new ClassName();");

      expect(editor).toHaveScopes([1, 5], 'new',       ["keyword.control.new.php"]);
      expect(editor).toHaveScopes([1, 9], 'ClassName', ["support.other.function.constructor.php"]);
      expect(editor).toHaveScopes([1, 18], '(',        ["punctuation.definition.begin.bracket.round.php"]);
      expect(editor).toHaveScopes([1, 19], ')',        ["punctuation.definition.end.bracket.round.php"]);
    });

    it("scopes class modifiers", async () => {
      await editor.setPhpText("abstract class Test {}");

      expect(editor).toHaveScopes([1, 0], 'abstract', ["keyword.control.abstract.php"]);
      expect(editor).toHaveScopes([1, 9], 'class', ["storage.type.class.php"]);

      await editor.setPhpText("final class Test {}");

      expect(editor).toHaveScopes([1, 0], 'final', ["keyword.control.final.php"]);
      expect(editor).toHaveScopes([1, 6], 'class', ["storage.type.class.php"]);
    });

    describe('properties', () => {
      it('scopes readonly properties', async () => {
        await editor.setPhpText(`
          class Test {
            public readonly int $a;
          }`)

          expect(editor).toHaveScopes([1, 0], 'class',    ['storage.type.TYPE.php'])
          expect(editor).toHaveScopes([2, 2], 'public',   ['storage.modifier.public.php'])
          expect(editor).toHaveScopes([2, 9], 'readonly', ['storage.modifier.readonly.php'])
          expect(editor).toHaveScopes([2, 18], 'int',     ['storage.type.builtin.php'])
        })

    })
  });

  describe("phpdoc", () => {
    it("scopes @return tags", async () => {
      await editor.setPhpText("/** @return Foo<Bar> */");

      expect(editor).toHaveScopes([1,  0], '/**',     ['comment.block.documentation.phpdoc.php', 'punctuation.definition.begin.comment.phpdoc.php']);
      expect(editor).toHaveScopes([1,  4], '@return', ['comment.block.documentation.phpdoc.php', 'entity.name.tag.phpdoc.php']);
      expect(editor).toHaveScopes([1, 12], 'Foo',     ['comment.block.documentation.phpdoc.php', 'storage.type.instance.phpdoc.php']);
      expect(editor).toHaveScopes([1, 15], '<',       ['comment.block.documentation.phpdoc.php']);
      expect(editor).toHaveScopes([1, 16], 'Bar',     ['comment.block.documentation.phpdoc.php', 'storage.type.instance.phpdoc.php']);
      expect(editor).toHaveScopes([1, 19], '>',       ['comment.block.documentation.phpdoc.php']);
      expect(editor).toHaveScopes([1, 21], '*/',      ['comment.block.documentation.phpdoc.php', 'punctuation.definition.end.comment.phpdoc.php']);
    });
  });
});

const dedent = require("dedent");

module.exports = {
  // Taken from Atom source at
  // https://github.com/atom/atom/blob/b3d3a52d9e4eb41f33df7b91ad1f8a2657a04487/spec/tree-sitter-language-mode-spec.js#L47-L55
  // Not used in tests, but included for reference. I recall that it works by
  // tokenizing lines and then lising the scopes for each token. This allows
  // specs like:
  //
  // editor.setPhpText(`
  // $foo + 1;
  // $bar->baz;
  // `)
  // expectTokensToEqual(
  //   editor,
  //   [
  //     [
  //       {text: '$foo', scopes: [...]}
  //       {text: '+', scopes: [...]}
  //       {text: '1', scopes: [...]}
  //     ],
  //     [
  //       {text: '$bar', scopes: [...]}
  //       {text: '->',   scopes: [...]}
  //       {text: 'baz', scopes: [...]}
  //     ]
  //   ]
  // )
  expectTokensToEqual(editor, expectedTokenLines, startingRow = 1) {
    const lastRow = editor.getLastScreenRow();

    for (let row = startingRow; row <= lastRow - startingRow; row++) {
      const tokenLine = editor
        .tokensForScreenRow(row)
        .map(({ text, scopes }) => ({
          text,
          scopes: scopes.map((scope) =>
            scope
              .split(" ")
              .map((className) => className.replace("syntax--", ""))
              .join(".")
          ),
        }));

      const expectedTokenLine = expectedTokenLines[row - startingRow];

      expect(tokenLine.length).toEqual(expectedTokenLine.length);
      for (let i = 0; i < tokenLine.length; i++) {
        expect(tokenLine[i].text).toEqual(
          expectedTokenLine[i].text,
          `Token ${i}, row: ${row}`
        );
        expect(tokenLine[i].scopes).toEqual(
          expectedTokenLine[i].scopes,
          `Token ${i}, row: ${row}, token: '${tokenLine[i].text}'`
        );
      }
    }
  },

  /**
   * A matcher to compare scopes applied by a tree-sitter grammar on a character
   * by character basis.
   *
   * @param  {array}        posn     Buffer position to be examined. A Point in the form [row, col]. Both are 0 based.
   * @param  {string|array} token    The token to be matched at the given position. Mostly just to make the tests easier to read.
   * @param  {?array}       expected The scopes that should be present.
   * @param  {Object}       options  Options to change what is asserted.
   */
  toHaveScopes(posn, token, expected, options = {}) {
    if (token === undefined) {
        throw new Error(
            'toHaveScopes must be called with at least 2 parameters'
        );
    }
    if (expected === undefined) {
      expected = token;
      token = '';
    }

    // remove base scopes by default
    const removeBaseScopes = options.removeBaseScopes ?? true;
    const filterBaseScopes = (scope) =>
      (
        removeBaseScopes &&
        scope !== "text.html.php" &&
        scope !== "source.php"
      );

    // this.actual is a Pulsar TextEditor
    const line = this.actual.getBuffer().lineForRow(posn[0]);
    const caret = " ".repeat(posn[1]) + "^";

    const actualToken = this.actual
        .getTextInBufferRange([posn, [posn[0], posn[1] + token.length]]);

    if (actualToken !== token) {
        this.message = () => `
  Failure: Tokens did not match at position [${posn.join(", ")}]:
${line}
${caret}
  Expected token: ${token}
`
        return false;
    }

    const actualScopes = this.actual
      .scopeDescriptorForBufferPosition(posn)
      .scopes
      .filter(filterBaseScopes);

    const notExpected = actualScopes.filter((scope) => !expected.includes(scope));
    const notReceived = expected.filter((scope) => !actualScopes.includes(scope));

    const pass = notExpected.length === 0 && notReceived.length === 0;

    if (pass) {
      this.message = () => "Scopes matched";
      return true;
    }

    this.message = () =>
      `
  Failure: Scopes did not match at position [${posn.join(", ")}]:
${line}
${caret}
  These scopes were expected but not received:
      ${notReceived.join(", ")}
  These scopes were received but not expected:
      ${notExpected.join(", ")}
      ` +
      (
        (options.showAllScopes ?? false)
        ? `
  These were all scopes recieved:
      ${actualScopes.join(", ")}
  These were all scopes expected:
      ${expected.join(", ")}
        `
        : ''
     );

    return false;
  },

  /**
   * Wrap a code snippet in PHP tags, insert it into an editor, and wait for the
   * language mode to be ready.
   * @param  {string}  content a PHP code snippet
   * @return {Promise}         resolves when the editor language mode is ready
   */
  async setPhpText(content) {
    this.setText(`<?php
${dedent(content)}
`);
    await this.languageMode.ready
  },

  // currently unused; may only be needed for legacy tree-sitter grammars?
  nextHighlightingUpdate(editor) {
    return new Promise((resolve) => {
      const subscription = editor
        .getBuffer()
        .getLanguageMode()
        .onDidChangeHighlighting(() => {
          subscription.dispose();
          resolve();
        });
    });
  },
};


(superclass
  (constant) @entity.name.type.class.ruby
  .
)

(superclass
  "<" @punctuation.separator.inheritance.ruby
  (constant) @entity.other.inherited-class.ruby
  (#set! final "true")
)

; Keywords
[
  "alias"
  "and"
  "begin"
  "break"
  "case"
  "class"
  "def"
  "do"
  "else"
  "elsif"
  "end"
  "ensure"
  "for"
  "if"
  "in"
  "module"
  "next"
  "or"
  "rescue"
  "retry"
  "return"
  "then"
  "unless"
  "until"
  "when"
  "while"
  "yield"
] @keyword.control.ruby

; module [Foo]
(module
  name: (constant) @entity.name.type.module.ruby
  (#set! final "true")
)

(singleton_class
  "<<" @keyword.operator.assigment.ruby
)

(call
  method: (identifier) @keyword.other.special-method (#match? @keyword.other.special-method "^(raise)$")
)

; Mark `new` as a special method in all contexts, from `Foo.new` to
; `Foo::Bar::Baz.new` and so on.
(call
  receiver: (_)
  method: (identifier) @function.method.builtin.ruby
  (#eq? @function.method.builtin.ruby "new")
)

(superclass
  (scope_resolution
    scope: (constant) @entity.other.inherited-class.ruby
    name: (constant) @entity.other.inherited-class.ruby
  )
)

; FOO should be highlighted like a constant…
(scope_resolution
  scope: (constant) @constant.ruby (#match? @constant.ruby "^[A-Z\\d_]+$")
  (#set! final "true")
)

; … but `Foo` should be highlighted like a class or namespace.
(scope_resolution
  scope: (constant) @support.class.ruby (#not-match? @support.class.ruby "^[A-Z\\d_]+$")
  (#set! final "true")
)

; ((variable) @keyword.other.special-method
; (#match? @keyword.other.special-method "^(extend)$"))

((identifier) @keyword.other.special-method
  (#match? @keyword.other.special-method "^(private|protected|public)$"))


; Highlight the interpolation inside of a string, plus the strings that delimit
; the interpolation.
(interpolation
  ; "#{" @punctuation.special.begin
  ; "}" @punctuation.special.end
) @meta.embedded

; Function calls

; TODO: The TM grammar this as `keyword.control.pseudo-method.ruby`; decide on
; the best name for it.
((identifier) @function.method.builtin.ruby
 (#eq? @function.method.builtin.ruby "require"))

"defined?" @function.method.builtin.ruby

(call
  method: [(identifier)] @support.function.kernel.ruby
  (#match? @support.function.kernel.ruby "^(abort|at_exit|autoload|binding|callcc|caller|caller_locations|chomp|chop|eval|exec|exit|fork|format|gets|global_variables|gsub|lambda|load|local_variables|open|p|print|printf|proc|putc|puts|rand|readline|readlines|select|set_trace_func|sleep|spawn|sprintf|srand|sub|syscall|system|test|trace_var|trap|untrace_var|warn)$")
)

; Function definitions

(class name: [(constant)]
  @entity.name.type.class.ruby
  (#set! final "true"))

; TODO: In theory, the entire class body should be targetable with this scope,
; but I can't get it to apply to an entire class body.

;(class) @meta.class.ruby

(alias (identifier) @function.method)
(setter (identifier) @function.method)
(method name: [(identifier) (constant)] @entity.name.function.ruby)
(singleton_method name: [(identifier) (constant)] @function.method)

; Identifiers

(global_variable) @variable.other.readwrite.global.ruby

(class_variable) @variable.other.readwrite.class.ruby

(instance_variable) @variable.other.readwrite.instance.ruby

(exception_variable (identifier) @variable.parameter.ruby)
(call receiver: (identifier) @variable.other.ruby)

; (call
;   receiver: (constant) @support.class.ruby
;   method: (identifier) @function.method.builtin.ruby
;   (#eq? @function.method.builtin.ruby "new")
; )

(call
  method: [(identifier) (constant)] @keyword.other.special-method (#match? @keyword.other.special-method "^(extend)$"))


(call
  method: [(identifier) (constant)] @function.method)

; (call
;   method: (scope_resolution
;     scope: [(constant) (scope_resolution)] @support.class.ruby
;     "::" @keyword.operator.namespace.ruby
;     name: [(constant)] @support.class.ruby
;   )
; )


(scope_resolution
  scope: [(constant) (scope_resolution)]
  "::" @keyword.operator.namespace.ruby
  name: [(constant)] @support.class.ruby
  (#set! final "true")
)


(call
  receiver: (constant) @constant.ruby (#match? @constant.ruby "^[A-Z\\d_]+$")
)
(call receiver: (constant)
 @support.class.ruby (#not-match? @support.class.ruby "^[A-Z\\d_]+$")
)

((identifier) @constant.builtin.ruby
 (#match? @constant.builtin.ruby "^__(FILE|LINE|ENCODING)__$"))

((constant) @constant.ruby
 (#match? @constant.ruby "^[A-Z\\d_]+$")
 (#set! final "true"))

((constant) @variable.other.constant.ruby
 (#not-match? @variable.other.constant.ruby "^[A-Z\\d_]+$")
)

(self) @variable.language.self.ruby
(super) @keyword.control.pseudo-method.ruby

(block_parameter (identifier) @variable.parameter)
(block_parameters (identifier) @variable.parameter)
(destructured_parameter (identifier) @variable.parameter)
(hash_splat_parameter (identifier) @variable.parameter)
(lambda_parameters (identifier) @variable.parameter)
(method_parameters (identifier) @variable.parameter)
(splat_parameter (identifier) @variable.parameter)

(keyword_parameter name: (identifier) @constant.other.symbol.parameter.ruby)
(optional_parameter name: (identifier) @variable.parameter)

((identifier) @support.function.kernel.ruby
  (#match? @support.function.kernel.ruby "^(abort|at_exit|autoload|binding|callcc|caller|caller_locations|chomp|chop|eval|exec|exit|fork|format|gets|global_variables|gsub|lambda|load|local_variables|open|p|print|printf|proc|putc|puts|rand|readline|readlines|select|set_trace_func|sleep|spawn|sprintf|srand|sub|syscall|system|test|trace_var|trap|untrace_var|warn)$"))



((identifier) @function.method
 (#is-not? local))

;((constant) @constant.ruby
;  (#match? @constant.ruby "^[A-Z\\d_]+$"))

; (identifier) @variable

; Literals

; TODO: I can't mark these as @string.quoted.double.ruby yet because the "s
; match _any_ delimiter, including single quotes and %Qs. This is probably a
; bug in tree-sitter-ruby.
; (string
;   "\"" @punctuation.definition.string.begin.ruby
;   (string_content)
;   "\"" @punctuation.definition.string.end.ruby
; ) @string.quoted.ruby

; (will match empty strings)
(string) @string.quoted.ruby

[
  (bare_string)
  (subshell)
  (heredoc_body)
  (heredoc_beginning)
] @string.unquoted.ruby

[
  (simple_symbol)
  (delimited_symbol)
  (hash_key_symbol)
  (bare_symbol)
] @constant.other.symbol.ruby

(regex) @string.special.regex
(escape_sequence) @escape

[
  (integer)
  (float)
] @constant.numeric.ruby

[
  (nil)
  (true)
  (false)
] @constant.builtin

(comment) @comment.line.number-sign.ruby

; Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

; To distinguish them from the bitwise "|" operator.
(block_parameters
  "|" @punctuation
)

(binary
  "|" @keyword.operator.other.ruby
)

; Operators

"(" @punctuation.brace.round.begin.ruby
")" @punctuation.brace.round.end.ruby
"[" @punctuation.brace.square.begin.ruby
"]" @punctuation.brace.square.end.ruby
"{" @punctuation.brace.curly.begin.ruby
"}" @punctuation.brace.curly.end.ruby

(conditional
  ["?" ":"] @keyword.operator.conditional.ruby
)


[
  "="
  "||="
  "+="
  "-="
  "<<"
] @keyword.operator.assigment.ruby

[
  "||"
  "&&"
] @keyword.operator.logical.ruby

[
  "&"
] @keyword.operator.other.ruby

[
  "=="
  ">="
  "<="
  ">"
  "<"
] @keyword.operator.comparison.ruby

[
  "+"
  "-"
  "*"
  "/"
  "**"
] @keyword.operator.arithmetic.ruby

[
  "=>"
  "->"
] @keyword.operator

[
  ","
  ";"
  "."
  ":"
] @punctuation.separator

;[
;  "("
;  ")"
;  "["
;  "]"
;  "{"
;  "}"
;  "%w("
;  "%i("
;] @punctuation.bracket

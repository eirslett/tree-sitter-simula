(identifier) @variable

; All the kinds of comments
[
    (comment)
    (end_comment)
    (first_directive)
    (directive)
    (line_comment)
] @comment

[
  ";"
  ":"
  ","
] @punctuation.delimiter

(procedure_statement
    procedure: (identifier) @function
)

(string_literal) @string
(character_literal) @character
(number_literal) @number
[
    (boolean_literal)
    (none)
    (notext)
] @constant.builtin

[
    (this)
] @variable.builtin

[
    (text)
    (character)
    (array)
    (integer)
    (boolean)
    (real)
    (short)
    (long)
    (ref)
    (procedure)
    (label)
] @type.builtin

(ref_expression
    class_name: (identifier) @class
)
(class_declaration
    (class)
    class_name: (identifier) @class
)

[
    "<"
    (lt)
    "<="
    (le)
    "="
    (eq)
    ">="
    (ge)
    ">"
    (gt)
    "<>"
    (ne)
    "=="
    "=/="
    (is)
    (in)

    (and)
    (or)
    (imp)
    (eqv)

    (not)

    "+"
    "-"
    "*"
    "**"
    "/"
    "//"
    "&"
] @operator

[
    ":="
    ":-"
] @operator

[
  "("
  ")"
]  @punctuation.bracket

; control flow
[
    (if)
    (then)
    (else)
    (while)
    (do)
    (for)
    (step)
    (until)
    (goto)
    (inspect)
    (when)
    (otherwise)
    (begin)
    (end)
    (switch)
    (activate)
    (reactivate)
    (at)
    (delay)
    (before)
    (after)
    (prior)
] @keyword

; other keywords
[
    (ref)
    (new)
    (class)
    (inner)
    (qua)
    (name)
    (value)
    (external)
    (virtual)
    (hidden)
    (protected)
] @keyword

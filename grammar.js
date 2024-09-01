/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  COMMENT: 0,
  ISO_CODE: 1,
  COMPOUND_STATEMENT: -1,

  TOKEN: 1,

  // 3.5.2 Precedence of arithmetic operators
  EXPONENTIATION: 24,
  MULTIPLICATION: 23,
  DIVISION: 22,
  INTEGER_DIVISION: 21,
  ADDITION: 20,
  SUBTRACTION: 19,

  STRING_CONCAT: 18,

  // 3.5.3 Precedence of boolean operators
  LESS_THAN: 17,
  LESS_THAN_OR_EQUAL: 16,
  EQUAL: 15,
  GREATER_THAN_OR_EQUAL: 14,
  GREATER_THAN: 13,
  NOT_EQUAL: 12,
  REF_EQUAL: 11,
  REF_NOT_EQUAL: 10,
  IS: 9,
  IN: 8,

  NOT: 7,

  AND: 6,
  OR: 5,
  IMP: 4,
  EQUIV: 3,
};

// Borrowed from tree-sitter-fortran
function caseInsensitive(keyword, aliasAsWord = true) {
  const result = new RegExp(keyword, "i");
  if (aliasAsWord) {
    return alias(result, keyword);
  } else {
    return result;
  }
}

function tok(keyword, aliasAsWord = true) {
  return token(prec(PREC.TOKEN, caseInsensitive(keyword, aliasAsWord)));
}

function listOf(separator, rule) {
  return seq(rule, repeat(seq(separator, rule)));
}

module.exports = grammar({
  name: "simula",
  externals: ($) => [$.end_comment, $.error_sentinel],
  extras: ($) => [/\s+/, $.comment, $.line_comment, $.directive],
  word: ($) => $.identifier,

  rules: {
    // Chapter 6: Program Modules
    source_file: ($) =>
      seq(
        repeat($.first_directive),
        optional($._external_head),
        choice($.block, $.procedure_declaration, $.class_declaration),
        optional(";"),
        optional("\0")
      ),

    // 4.9 Compound statements
    block: ($) =>
      prec.left(
        PREC.COMPOUND_STATEMENT,
        seq(
          // 4.10.1 Prefixed blocks
          optional(seq(field("class", $.procedure_statement))),
          $.begin,

          choice(
            // Option 1: no declarations or statements
            repeat(";"),

            // Option 2: only declarations
            seq(listOf(repeat1(";"), $._declaration), repeat(";")),

            // Option 3: declarations and statements
            seq(
              listOf(repeat1(";"), $._declaration),
              repeat1(";"),
              listOf(repeat1(";"), $._statement),
              repeat(";")
            ),

            // Option 4: only statements
            seq(listOf(repeat1(";"), $._statement), repeat(";"))
          ),

          // TODO: make it work with just a label at the end of the block
          // optional(seq($.label_declaration, ":")),
          $.end
        )
      ),
    begin: ($) => caseInsensitive("begin"),
    end: ($) => seq(caseInsensitive("end"), optional($.end_comment)),

    // ==== Chapter 1: Lexical tokens ====

    // 1.1 Directive lines
    // Instructions: must start at the beginning of a line
    directive: ($) => /\n%.*/,
    first_directive: ($) => /%.*\n/, // if the first program line is a directive

    // 1.4 Identifiers
    // According to the Simula spec, only these characters are allowed
    // identifier: ($) => /[A-z][A-z0-9_]*/,
    // But actually, let's be a bit more lenient and allow all Unicode words like イスクリーム123
    // (and Æ Ø Å, since the language was developed in Norway.)
    identifier: ($) => /\p{L}[\p{L}0-9_]*/u,
    _identifier1: ($) => choice($.identifier, $.remote_identifier),

    // 1.5 Numbers
    // This is unsigned-number, decimal-number, decimal-fraction, exponent-part, unsigned-integer, radix, radix-digit
    number_literal: ($) =>
      choice(
        // Decimal numbers
        /((\d+\.\d[\d_]*)|(\.?\d[\d_]*))(&&?[+-]?\d+)?/,

        // Only the exponent part
        /&&?[+-]?\d+/,

        // Radix numbers
        /([1248]|(16))[Rr][\dA-Fa-f]+/
      ),

    // 1.6 Strings
    // Covers string, string-separator, simple-string, ISO-code, non-quote-character.
    // According to the Simula, we should only allow /"(("")|[ !#-z])*"/ but let's be
    // more lenient and allow all UTF-8 characters.
    string_literal: ($) =>
      repeat1(
        /"(("")|[^"])*"/ // This would fit all UTF-8 characters
      ),

    // 1.7 Character constants
    character_literal: ($) => /'((!\d{1,3}!)|.)'/, // allow all UTF-8 characters
    // character: ($) => /'((!\d{1,3}!)|[ -z])'/, // Simula only allows ASCII characters

    // 1.8 Comments
    // 1.8.1 End comment - covered in scanner.c

    // 1.8.2 Direct comment
    comment: ($) =>
      token(
        prec(
          PREC.COMMENT,
          seq(
            choice("!", caseInsensitive("comment")),
            repeat(/[^;]/),
            token.immediate(";")
          )
        )
      ),

    // This style of comment is actually not an official part of Simula (according to the standard)
    // but it's used in a lot of Simula code. Since this grammar is for a syntax
    // highlighter, let's support it.
    line_comment: ($) => /--[^\n\r]*/,

    // Chapter 2: Types and values
    type_expression: ($) => choice($._value_type, $._reference_type),
    _value_type: ($) => choice($._arithmetic_type, $.boolean, $.character),
    _arithmetic_type: ($) => choice($._integer_type, $._real_type),
    _integer_type: ($) => seq(optional($.short), $.integer),
    _real_type: ($) => seq(optional($.long), $.real),
    _reference_type: ($) => choice($.ref_expression, $.text),
    ref_expression: ($) =>
      seq($.ref, "(", field("class_name", $.identifier), ")"),
    ref: ($) => tok("ref"),
    integer: ($) => tok("integer"),
    real: ($) => tok("real"),
    long: ($) => tok("long"),
    short: ($) => tok("short"),
    text: ($) => tok("text"),
    boolean: ($) => tok("boolean"),
    character: ($) => tok("character"),

    // Chapter 3: Expressions
    _expression: ($) =>
      prec(
        5,
        choice(
          $._binary_expression,
          $._unary_expression,
          $.string_literal,
          $.number_literal,
          $.boolean_literal,
          $.notext,
          $.character_literal,
          $.conditional_statement,
          $._object_expression,
          $.procedure_statement
        )
      ),

    // 3.1.5 Remote identifiers
    remote_identifier: ($) =>
      choice(
        seq(
          field("target", $._object_expression),
          ".",
          field("property", $.identifier)
        )
      ),

    // 3.2 Boolean expressions
    boolean_literal: ($) => choice(tok("true"), tok("false")),

    notext: ($) => tok("notext"),

    less_than: ($) =>
      prec.left(
        PREC.LESS_THAN,
        seq(
          field("lhs", $._expression),
          choice("<", $.lt), // 1.10.1 Alternate representation of some symbols
          field("rhs", $._expression)
        )
      ),
    lt: ($) => tok("lt"),

    less_than_or_equal: ($) =>
      prec.left(
        PREC.LESS_THAN_OR_EQUAL,
        seq(
          field("lhs", $._expression),
          choice("<=", $.le), // 1.10.1 Alternate representation of some symbols
          field("rhs", $._expression)
        )
      ),
    le: ($) => tok("le"),

    equal: ($) =>
      prec.left(
        PREC.EQUAL,
        seq(
          field("lhs", $._expression),
          choice("=", $.eq), // 1.10.1 Alternate representation of some symbols
          field("rhs", $._expression)
        )
      ),
    eq: ($) => tok("eq"),

    greater_than_or_equal: ($) =>
      prec.left(
        PREC.GREATER_THAN_OR_EQUAL,
        seq(
          field("lhs", $._expression),
          choice(">=", $.ge), // 1.10.1 Alternate representation of some symbols
          field("rhs", $._expression)
        )
      ),
    ge: ($) => tok("ge"),

    greater_than: ($) =>
      prec.left(
        PREC.GREATER_THAN,
        seq(
          field("lhs", $._expression),
          choice(">", $.gt), // 1.10.1 Alternate representation of some symbols
          field("rhs", $._expression)
        )
      ),
    gt: ($) => tok("gt"),

    not_equal: ($) =>
      prec.left(
        PREC.NOT_EQUAL,
        seq(
          field("lhs", $._expression),
          choice("<>", $.ne), // 1.10.1 Alternate representation of some symbols
          field("rhs", $._expression)
        )
      ),
    ne: ($) => tok("ne"),

    ref_equal: ($) =>
      prec.left(
        PREC.REF_EQUAL,
        seq(field("lhs", $._expression), "==", field("rhs", $._expression))
      ),
    ref_not_equal: ($) =>
      prec.left(
        PREC.REF_NOT_EQUAL,
        seq(field("lhs", $._expression), "=/=", field("rhs", $._expression))
      ),

    is_expression: ($) =>
      prec.left(
        PREC.IS,
        seq(field("lhs", $._expression), $.is, field("rhs", $._expression))
      ),
    is: ($) => tok("is"),

    in_expression: ($) =>
      prec.left(
        PREC.IN,
        seq(field("lhs", $._expression), $.in, field("rhs", $._expression))
      ),
    in: ($) => tok("in"),

    and_expression: ($) =>
      prec.left(
        PREC.AND,
        seq(
          field("lhs", $._expression),
          $.and,
          field("extra", optional($.then)),
          field("rhs", $._expression)
        )
      ),
    and: ($) => tok("and"),

    else: ($) => tok("else"),

    or_expression: ($) =>
      prec.left(
        PREC.OR,
        seq(
          field("lhs", $._expression),
          $.or,
          field("extra", optional($.else)),
          field("rhs", $._expression)
        )
      ),
    or: ($) => tok("or"),

    imp_expression: ($) =>
      prec.left(
        PREC.IMP,
        seq(field("lhs", $._expression), $.imp, field("rhs", $._expression))
      ),
    imp: ($) => tok("imp"),

    eqv_expression: ($) =>
      prec.left(
        PREC.EQUIV,
        seq(field("lhs", $._expression), $.eqv, field("rhs", $._expression))
      ),
    eqv: ($) => tok("eqv"),

    not_expression: ($) =>
      prec.left(PREC.NOT, seq($.not, field("rhs", $._expression))),
    not: ($) => tok("not"),

    if: ($) => tok("if"),
    then: ($) => tok("then"),

    _binary_expression: ($) =>
      choice(
        $.string_concat,
        $.exponentiation,
        $.multiplication,
        $.division,
        $.integer_division,
        $.addition,
        $.subtraction,
        $.less_than,
        $.less_than_or_equal,
        $.equal,
        $.greater_than_or_equal,
        $.greater_than,
        $.not_equal,
        $.ref_equal,
        $.ref_not_equal,
        $.is_expression,
        $.in_expression,

        $.and_expression,
        $.or_expression,
        $.imp_expression,
        $.eqv_expression
      ),

    _unary_expression: ($) => choice($.not_expression, $.positive, $.negative),

    positive: ($) => seq("+", $._expression),
    negative: ($) => seq("-", $._expression),

    string_concat: ($) =>
      prec.left(
        PREC.STRING_CONCAT,
        seq(
          field("lhs", $._expression),
          token("&"),
          field("rhs", $._expression)
        )
      ),

    // 3.5 Arithmetic expressions
    exponentiation: ($) =>
      prec.left(
        PREC.EXPONENTIATION,
        seq(
          field("lhs", $._expression),
          token("**"),
          field("rhs", $._expression)
        )
      ),
    multiplication: ($) =>
      prec.left(
        PREC.MULTIPLICATION,
        seq(
          field("lhs", $._expression),
          token("*"),
          field("rhs", $._expression)
        )
      ),
    division: ($) =>
      prec.left(
        PREC.DIVISION,
        seq(
          field("lhs", $._expression),
          token("/"),
          field("rhs", $._expression)
        )
      ),
    integer_division: ($) =>
      prec.left(
        PREC.INTEGER_DIVISION,
        seq(
          field("lhs", $._expression),
          token("//"),
          field("rhs", $._expression)
        )
      ),
    addition: ($) =>
      prec.left(
        PREC.ADDITION,
        seq(
          field("lhs", $._expression),
          token("+"),
          field("rhs", $._expression)
        )
      ),
    subtraction: ($) =>
      prec.left(
        PREC.SUBTRACTION,
        seq(
          field("lhs", $._expression),
          token("-"),
          field("rhs", $._expression)
        )
      ),

    // 3.8 Object expressions
    _object_expression: ($) =>
      prec(
        1,
        choice(
          $.none,
          $._identifier1,
          $.procedure_statement,
          $.object_generator,
          $.local_object,
          $.qualified_object,
          $._paranthesized_expression
        )
      ),
    _paranthesized_expression: ($) => seq("(", $._expression, ")"),

    none: ($) => tok("none"),

    // 3.8.2 Object generator
    object_generator: ($) =>
      seq(
        $.new,
        field("name", $.identifier),
        optional(field("argument", seq("(", $._arguments, ")")))
      ),
    new: ($) => tok("new"),

    // 3.8.3 Local objects
    local_object: ($) => seq($.this, field("name", $.identifier)),
    ["this"]: ($) => tok("this"),

    qualified_object: ($) =>
      seq(
        field("target", $._object_expression),
        $.qua,
        field("name", $.identifier)
      ),
    qua: ($) => tok("qua"),

    // Chapter 4: Statements
    label_declaration: ($) => prec(1, seq($.identifier, ":")),
    _statement: ($) =>
      prec.left(
        10,
        choice(
          seq(
            repeat($.label_declaration),
            prec.left(
              choice(
                $._unconditional_statement,
                $.conditional_statement,
                $.for_statement
              )
            )
          ),
          // Just a label "dummy statement". In tree-sitter, it's not allowed to
          // setup grammars that resolve to an empty string, so instead we
          // define label declarations like this.
          repeat1($.label_declaration)
        )
      ),

    _unconditional_statement: ($) =>
      choice(
        $.inner,
        $._assignment_statement,
        $.while_statement,
        $.goto_statement,
        $.procedure_statement,
        $.object_generator,
        $.connection_statement,
        $.block,
        $.activation_statement
      ),

    inner: ($) => tok("inner"),

    // 4.1 Assignment statements
    _assignment_statement: ($) =>
      choice($.value_assignment, $.reference_assignment),

    value_assignment: ($) =>
      prec.right(
        50,
        seq(
          field("lhs", choice($._identifier1, $.procedure_statement)),
          ":=",
          field("rhs", choice($.value_assignment, $._expression))
        )
      ),
    reference_assignment: ($) =>
      prec.right(
        50,
        seq(
          field("lhs", choice($._identifier1, $.procedure_statement)),
          ":-",
          field("rhs", choice($.reference_assignment, $._expression))
        )
      ),

    // 4.2 Conditional statements
    // As opposed to conditional expressions, then/else here can be optional.
    conditional_statement: ($) =>
      prec.right(
        seq(
          $.if,
          field("condition", $._expression),
          $.then,
          field("then", optional(choice($._expression, $._statement))),
          optional(
            seq(
              $.else,
              optional(field("else", choice($._expression, $._statement)))
            )
          )
        )
      ),

    // 4.3 While statements
    while_statement: ($) =>
      prec.left(
        seq(
          $.while,
          field("condition", $._expression),
          $.do,
          optional(field("action", $._statement))
        )
      ),
    while: ($) => tok("while"),
    do: ($) => tok("do"),

    // 4.4 For-statement
    for_statement: ($) =>
      prec.left(
        seq(
          $.for,
          field("variable", $.identifier),
          choice(
            seq(":=", listOf(",", $._value_for_list_element)),
            seq(":-", listOf(",", $._reference_for_list_element))
          ),
          tok("do"),
          optional(field("action", $._statement))
        )
      ),
    for: ($) => tok("for"),
    step: ($) => tok("step"),
    until: ($) => tok("until"),

    _value_for_list_element: ($) =>
      prec.left(
        choice(
          field("range", $._expression),
          seq($._expression, $.while, $._expression),
          seq(
            field("start", $._expression),
            $.step,
            field("step", $._expression),
            $.until,
            field("until", $._expression)
          )
        )
      ),
    _reference_for_list_element: ($) =>
      prec.left(seq($._expression, optional(seq($.while, $._expression)))),

    // 4.5 Goto-statement
    goto_statement: ($) => seq($.goto, field("label", $.procedure_statement)),
    goto: ($) => choice(tok("goto"), seq(tok("go"), tok("to"))),

    // 4.6 Procedure statement
    _arguments: ($) => prec.right(listOf(",", $._expression)),
    procedure_statement: ($) =>
      prec(
        -5,
        choice(
          seq(
            field("procedure", $._identifier1),
            optional(seq("(", field("argument", $._arguments), ")"))
          )
        )
      ),

    // 4.8 Connection statement
    connection_statement: ($) =>
      choice($._simple_connection_statement, $._match_connection_statement),
    _simple_connection_statement: ($) =>
      prec.left(
        seq(
          $.inspect,
          field("target", $._expression),
          $.do,
          optional(field("action", $._statement)),
          optional($.otherwise_clause)
        )
      ),
    inspect: ($) => tok("inspect"),

    _match_connection_statement: ($) =>
      prec.right(
        seq(
          $.inspect,
          field("target", $._expression),
          repeat1($.when_clause),
          optional($.otherwise_clause)
        )
      ),
    when_clause: ($) =>
      prec.left(
        5,
        seq(
          $.when,
          field("type", $.identifier),
          $.do,
          optional(field("action", $._statement))
        )
      ),
    when: ($) => tok("when"),
    otherwise_clause: ($) =>
      prec.left(seq($.otherwise, optional(field("action", $._statement)))),
    otherwise: ($) => tok("otherwise"),

    // Chapter 5: Declarations
    _declaration: ($) =>
      choice(
        $.variable_declaration,
        $.array_declaration,
        $.switch_declaration,
        $.procedure_declaration,
        $.class_declaration,
        $._external_declaration
      ),

    // 5.1 Simple variable declarations
    variable_declaration: ($) =>
      prec.left(
        seq(
          field("type", $.type_expression),
          listOf(
            ",",
            seq(
              field("name", $.identifier),
              optional(seq("=", field("value", $._expression)))
            )
          )
        )
      ),

    // 5.2 Array declaration
    array: ($) => tok("array"),
    array_declaration: ($) =>
      prec.left(
        seq(
          field("type", optional($.type_expression)),
          $.array,
          listOf(",", $._array_segment)
        )
      ),
    _array_segment: ($) =>
      seq(
        listOf(",", field("name", $.identifier)),
        "(",
        listOf(",", $._bound_pair),
        ")"
      ),
    _bound_pair: ($) =>
      seq(field("from", $._expression), ":", field("to", $._expression)),

    // 5.3 Switch declaration
    switch_declaration: ($) =>
      seq(
        $.switch,
        field("name", $.identifier),
        ":=",
        listOf(",", $._expression)
      ),
    switch: ($) => tok("switch"),

    // 5.4 Procedure declaration
    procedure: ($) => tok("procedure"),
    name: ($) => tok("name"),
    value: ($) => tok("value"),
    procedure_declaration: ($) =>
      prec.left(
        seq(
          optional(field("return_type", $.type_expression)),
          $.procedure,

          // procedure-heading
          field("name", $.identifier),
          optional(
            seq(
              // formal-parameter-part
              field("parameter", seq("(", $._identifier_list, ")")),
              ";",

              repeat(
                // mode-part
                seq(
                  choice($.name, $.value),
                  field("mode", $._identifier_list),
                  ";"
                )
              ),

              // specification-part
              field("specification", listOf(";", $.specification))
            )
          ),
          ";",
          optional($._statement)
        )
      ),
    _identifier_list: ($) => listOf(",", $.identifier),
    specification: ($) =>
      seq(
        /* This grammar would be according to the official Simula
        Specification - but that one contains a mistake!
        choice(
          seq($.type_expression, optional(choice($.array, tok("procedure")))),
          tok("label"),
          tok("switch")
        ),
        */

        // Here is the correct EBNF:
        // See: https://github.com/portablesimula/github.io/blob/master/doc/Simula%20Standard%20-%20Errata.pdf
        choice(
          $.type_expression,
          seq(optional($.type_expression), $.array),
          seq(optional($.type_expression), $.procedure),
          $.label,
          $.switch
        ),
        $._identifier_list
      ),
    label: ($) => tok("label"),

    // 5.5 Class declaration
    class: ($) => tok("class"),
    virtual: ($) => tok("virtual"),
    class_declaration: ($) =>
      prec.left(
        seq(
          optional(field("base", $.identifier)),

          // main-part
          $.class,
          field("name", $.identifier),

          optional(
            seq(
              // formal-parameter-part
              seq("(", field("parameter", $._identifier_list), ")"),

              ";",

              optional(
                // value-part
                seq($.value, $._identifier_list, ";")
              ),

              // specification-part
              field("specification", listOf(";", $.specification))
            )
          ),
          ";",
          optional(
            seq(
              // protection-part
              listOf(";", $.protection_specification),
              ";"
            )
          ),
          optional(
            // virtual-part
            seq(
              prec.right(105, seq($.virtual, ":", listOf(";", $.virtual_spec))),
              ";"
            )
          ),
          optional($._statement)
        )
      ),

    // 5.5.4 Attribute protection
    hidden: ($) => tok("hidden"),
    protected: ($) => tok("protected"),
    protection_specification: ($) =>
      seq(
        choice(
          $.hidden,
          $.protected,
          seq($.hidden, $.protected),
          seq($.protected, $.hidden)
        ),
        $._identifier_list
      ),

    // 5.5.3 Virtual quantities
    virtual_spec: ($) =>
      choice(
        $.specification,
        seq(
          // difference from Simula Standard. This grammar is possibly missing from the standard:
          optional(
            choice($.type_expression, seq(optional($.type_expression), $.array))
          ),
          // end of difference

          $.procedure,
          field("name", $.identifier),
          $.is,
          $.procedure_declaration
        )
      ),

    // Chapter 6: Program Modules
    // 6.1 External declarations
    _external_head: ($) => repeat1(seq($._external_declaration, ";")),
    _external_declaration: ($) =>
      choice($.external_procedure_declaration, $.external_class_declaration),

    // 6.3 External procedure declaration
    external: ($) => tok("external"),
    external_procedure_declaration: ($) =>
      choice(
        seq(
          $.external,
          field("kind", optional($.identifier)),
          field("type", optional($.type_expression)),
          $.procedure,
          listOf(",", $.external_item)
        ),
        seq(
          $.external,
          field("kind", $.identifier),
          $.procedure,
          $.external_item,
          $.is,
          $.procedure_declaration
        )
      ),

    // 6.4 External class declaration
    external_class_declaration: ($) =>
      seq($.external, $.class, listOf(",", $.external_item)),

    // 6.5 Module identification
    external_item: ($) =>
      seq(
        field("name", $.identifier),
        optional(seq("=", field("external", $.string_literal)))
      ),

    // 12.2 Activation statements
    activate: ($) => tok("activate"),
    reactivate: ($) => tok("reactivate"),
    at: ($) => tok("at"),
    delay: ($) => tok("delay"),
    before: ($) => tok("before"),
    after: ($) => tok("after"),
    prior: ($) => tok("prior"),
    activation_statement: ($) =>
      prec.left(
        seq(
          choice($.activate, $.reactivate),
          field("target", $._expression),
          // scheduling-clause
          optional(
            choice(
              seq(
                choice(
                  seq($.at, field("at", $._expression)),
                  seq($.delay, field("delay", $._expression))
                ),
                optional($.prior)
              ),
              // timing-clause
              seq(
                choice(
                  seq($.before, field("before", $._expression)),
                  seq($.after, field("after", $._expression))
                )
              )
            )
          )
        )
      ),
  },
});

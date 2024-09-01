import XCTest
import SwiftTreeSitter
import TreeSitterSimula

final class TreeSitterSimulaTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_simula())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Simula grammar")
    }
}

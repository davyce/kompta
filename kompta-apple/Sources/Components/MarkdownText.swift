import SwiftUI

// ============================================================================
//  MarkdownText — lightweight markdown-to-SwiftUI renderer for Limule's
//  AI-generated reports/analyses (headings, bold/italic, bullet lists,
//  horizontal rules). Not a general-purpose parser: it targets the specific
//  subset of markdown that LLM output commonly uses, without pulling in a
//  full markdown SPM dependency.
// ============================================================================

/// Renders a markdown string as a column of SwiftUI views:
/// - `#`/`##`/`###` lines become bold, accent-colored headings (decreasing size).
/// - `---` / `***` alone on a line becomes a `Divider()`.
/// - `- ` / `* ` prefixed lines become bullet items (with proper indentation).
/// - Everything else is rendered as body text with native inline
///   `**bold**` / `*italic*` support via `AttributedString(markdown:)`.
struct MarkdownText: View {
    let text: String
    var accent: Color = .purple
    var bodySpacing: CGFloat = 8

    init(_ text: String, accent: Color = .purple, bodySpacing: CGFloat = 8) {
        self.text = text
        self.accent = accent
        self.bodySpacing = bodySpacing
    }

    var body: some View {
        VStack(alignment: .leading, spacing: bodySpacing) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                render(block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Block model

    private enum Block {
        case heading(level: Int, text: String)
        case rule
        case bullet(text: String)
        case blank
        case paragraph(text: String)
    }

    private var blocks: [Block] {
        text.components(separatedBy: "\n").map { rawLine in
            let line = rawLine.trimmingCharacters(in: .whitespaces)

            if line.isEmpty {
                return .blank
            }

            if let rule = Self.ruleLine(line) {
                return rule
            }

            if let heading = Self.headingLine(line) {
                return heading
            }

            if let bullet = Self.bulletLine(line) {
                return bullet
            }

            return .paragraph(text: line)
        }
    }

    private static func ruleLine(_ line: String) -> Block? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 3 else { return nil }
        if trimmed.allSatisfy({ $0 == "-" }) || trimmed.allSatisfy({ $0 == "*" }) || trimmed.allSatisfy({ $0 == "_" }) {
            return .rule
        }
        return nil
    }

    private static func headingLine(_ line: String) -> Block? {
        var level = 0
        var idx = line.startIndex
        while idx < line.endIndex, line[idx] == "#" {
            level += 1
            idx = line.index(after: idx)
        }
        guard level > 0, level <= 6, idx < line.endIndex, line[idx] == " " else { return nil }
        let content = String(line[line.index(after: idx)...]).trimmingCharacters(in: .whitespaces)
        guard !content.isEmpty else { return nil }
        return .heading(level: level, text: content)
    }

    /// A bullet line must start with `- ` or `* ` (dash/asterisk immediately
    /// followed by a space). This deliberately excludes lines that start with
    /// `**bold text**` (no space right after the leading `*`), so emphasis
    /// markup at the start of a paragraph is never mistaken for a list item.
    private static func bulletLine(_ line: String) -> Block? {
        if line.hasPrefix("- ") {
            return .bullet(text: String(line.dropFirst(2)))
        }
        if line.hasPrefix("* "), !line.hasPrefix("** ") {
            return .bullet(text: String(line.dropFirst(2)))
        }
        if line.hasPrefix("• ") {
            return .bullet(text: String(line.dropFirst(2)))
        }
        return nil
    }

    // MARK: - Rendering

    @ViewBuilder
    private func render(_ block: Block) -> some View {
        switch block {
        case .blank:
            Spacer().frame(height: 2)

        case .rule:
            Divider().padding(.vertical, 2)

        case .heading(let level, let text):
            inlineText(text)
                .font(headingFont(for: level))
                .foregroundStyle(accent)
                .padding(.top, level <= 2 ? 6 : 4)

        case .bullet(let text):
            HStack(alignment: .top, spacing: 8) {
                Text("•")
                    .font(.callout.bold())
                    .foregroundStyle(accent)
                inlineText(text)
                    .font(.callout)
                    .foregroundStyle(.primary)
            }
            .padding(.leading, 4)
            .fixedSize(horizontal: false, vertical: true)

        case .paragraph(let text):
            inlineText(text)
                .font(.callout)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func headingFont(for level: Int) -> Font {
        switch level {
        case 1: return .title3.bold()
        case 2: return .headline.bold()
        default: return .subheadline.bold()
        }
    }

    /// Parses inline markdown (`**bold**`, `*italic*`, `_italic_`, links) via
    /// the native AttributedString markdown initializer, falling back to
    /// plain text if parsing fails (never crashes on malformed LLM output).
    private func inlineText(_ raw: String) -> Text {
        if let attributed = try? AttributedString(markdown: raw, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            return Text(attributed)
        }
        return Text(raw)
    }
}

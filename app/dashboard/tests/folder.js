describe("folder", function () {
  global.test.site({ login: true });

  const testCases = [
    // Basic names
    "a.txt", // Simple file
    "a/normal/file.txt", // Simple nested file

    // Whitespace edge cases
    " leading-space", // Leading space
    "trailing-space ", // Trailing space
    "multiple    spaces", // Multiple consecutive spaces
    "tab\ttab", // Tab character
    "space\t\ttab", // Mixed spaces and tabs
    "new\nline", // Newline character

    // Common special characters
    "semi;colon", // Semicolon
    "asterisk*star", // Asterisk
    'quote"marks"', // Double quotes
    "single'quote", // Single quote
    "pipe|pipe", // Pipe
    "question?mark", // Question mark
    "<>anglebrackets", // Angle brackets
    "[brackets]", // Square brackets
    "{curly}", // Curly braces
    "(parentheses)", // Parentheses
    "colon:colon", // Colon
    "dash-start", // Dash at start
    "end-dash-", // Dash at end
    "_underscore_", // Underscore
    "@at-sign", // At sign
    "#hashtag", // Hashtag
    "!exclaim!", // Exclamation mark
    "$dollar$", // Dollar sign
    "percent%", // Percent sign
    "caret^", // Caret
    "tilde~", // Tilde

    // Windows reserved words and device files
    "CON", // Reserved device name (Windows)
    "nul", // Reserved device name (Windows)

    // Special/encoded characters and percent-encoding
    "20% luck/30% skill.txt/99% will.txt", // Percent sign and nested path

    // File and folder names with dots and slashes
    "app/bar.txt", // Slash in path
    "slash/forward", // Forward slash
    "slash\\backward", // Backslash
    "file.name.with.dots", // Multiple dots

    // Accented and Unicode
    "tést", // Accented character
    "accentèd", // Another accented
    "𝓤𝓷𝓲𝓬𝓸𝓭𝓮", // Unicode fancy letters

    // Emoji and symbols
    "emoji-💾", // Emoji in name
    "emoji/文件夹/😀/файл", // Emoji + CJK + Cyrillic (nested)

    // Long names
    "A_very_very_very_very_very_very_very_very_very_very_long_folder_name", // Long folder name
    "A_very_very_very_very_very_very_very_very_very_very_long_folder_name/UPPERCASE", // Nested long folder

    // Mixed case and numeric
    "foo bar/space tab.txt", // Space in path
    "foo bar/space\t\ttab", // Space + tab in path
    "123456", // Numeric name
    "UPPERCASE", // All uppercase
    "MiXeDcAsE", // Mixed case

    // [Empty] and duplicate
    "[empty]", // Literal "[empty]"
    "duplicate", // Simple duplicate test

    // Nested and complex paths
    "tilde~/[empty]", // Tilde + nested [empty]
    "test/emoji-💾/文件夹", // Mixed emoji and CJK in path
    "CON/nul/pipe|pipe", // Reserved device names in path
    "slash/forward/question?mark", // Special chars in nested path
    "nested1/nested2/nested3/nested4", // Deep nesting
    "emoji-💾/20% luck/[brackets]", // Emoji + percent + brackets
    "tab\ttab/new\nline", // Tab and newline in path

    // Non-Latin alphabets (single-language)
    "русский/папка/файл", // Cyrillic (Russian)
    "Ελληνικά/φάκελος/αρχείο", // Greek
    "עברית/תיקיה/קובץ", // Hebrew (RTL)
    "العربية/مجلد/ملف", // Arabic (RTL)
    "中文/文件夹/文件", // Chinese (Simplified)
    "日本語/フォルダ/ファイル", // Japanese (Kana/Kanji)
    "한국어/폴더/파일", // Korean (Hangul)
    "हिन्दी/फ़ोल्डर/फ़ाइल", // Hindi (Devanagari)
    "ไทย/โฟลเดอร์/ไฟล์", // Thai

    // Other scripts
    "ગુજરાતી/ફોલ્ડર/ફાઇલ", // Gujarati
    "ελληνικά/έγγραφα/αρχείο", // Greek (with accents)
    "বাংলা/ফোল্ডার/ফাইল", // Bengali
    "தமிழ்/கோப்பு/அடைவு", // Tamil
    "አማርኛ/ፎልደር/ፋይል", // Amharic (Ethiopic)
    "ⲁⲛⲅⲗⲓⲕⲟⲛ/ⲫⲩⲗⲗⲟⲛ/ⲫⲁⲓⲗ", // Coptic

    // Mixed language and special character cases
    "अंग्रेज़ी/😀/folder", // Hindi + Emoji + English
    "العربية/tilde~/مجلد", // Arabic + tilde + English
    "русский/semi;colon", // Cyrillic + semicolon
    "Ελληνικά/trailing-space ", // Greek + trailing space
    "한국어/😀/emoji", // Korean + emoji
    "中文/空 格/😀", // Chinese + space + emoji
    "עברית/מסמך/😀", // Hebrew + emoji
    "日本語/ファイル/💾", // Japanese + emoji
  ];

  for (const path of testCases) {
    it(`handles path ${path}`, async function () {
      await this.write({ path, content: "test content here" });

      let $ = await this.parse(`/sites/${this.blog.handle}`);
      const pathComponents = path.split("/").filter(Boolean);

      // Navigate through each directory in the path
      for (const [index, component] of pathComponents.entries()) {
        const link = findElementByText(".directory-list a", component, $);
        if (!link) {
          throw new Error(
            `Link not found for "${component}" in path "${path}"`,
          );
        }

        $ = await this.parse(link.attr("href"));

        // Handle the final component (file)
        if (index === pathComponents.length - 1) {
          const fileHeader = findElementByText("h1", component, $);
          if (!fileHeader) {
            throw new Error(`Header not found for file "${component}"`);
          }

          const downloadLink = $("a:contains('Download file')").attr("href");
          if (!downloadLink) {
            throw new Error("Download link not found");
          }

          const fileContent = await this.text(downloadLink);
          expect(fileContent).toBe("test content here");
        }
      }
    });
  }

  function findElementByText(selector, text, $) {
    return $(selector)
      .filter(function () {
        return $(this).text().includes(text);
      })
      .first();
  }
});

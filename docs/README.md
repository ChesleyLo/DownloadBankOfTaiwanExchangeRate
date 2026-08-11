# Documentation Index

| Language | User Guide (Markdown) | Technical Guide (Markdown) | Word | PDF |
| --- | --- | --- | --- | --- |
| 繁體中文 | [USER_GUIDE.zh-TW.md](./USER_GUIDE.zh-TW.md) | [TECHNICAL.zh-TW.md](./TECHNICAL.zh-TW.md) | [word/USER_GUIDE.zh-TW.docx](./word/USER_GUIDE.zh-TW.docx) / [word/TECHNICAL.zh-TW.docx](./word/TECHNICAL.zh-TW.docx) | [pdf/USER_GUIDE.zh-TW.pdf](./pdf/USER_GUIDE.zh-TW.pdf) / [pdf/TECHNICAL.zh-TW.pdf](./pdf/TECHNICAL.zh-TW.pdf) |
| English | [USER_GUIDE.en.md](./USER_GUIDE.en.md) | [TECHNICAL.en.md](./TECHNICAL.en.md) | [word/USER_GUIDE.en.docx](./word/USER_GUIDE.en.docx) / [word/TECHNICAL.en.docx](./word/TECHNICAL.en.docx) | [pdf/USER_GUIDE.en.pdf](./pdf/USER_GUIDE.en.pdf) / [pdf/TECHNICAL.en.pdf](./pdf/TECHNICAL.en.pdf) |

Also available:

- [word/Documentation-Index.docx](./word/Documentation-Index.docx)
- [pdf/Documentation-Index.pdf](./pdf/Documentation-Index.pdf)

- **User Guide**: CDN URLs, NetSuite admin setup, schedule, FAQ  
- **Technical Guide**: architecture, CSV/JSON contract, Actions, how to change download / transform / SuiteScript logic  

## Regenerate Word / PDF files

After editing Markdown, rebuild distribution files:

```bash
python3 -m pip install -r requirements.txt
python3 scripts/md_to_docx.py
python3 scripts/md_to_pdf.py
```

- Word 輸出目錄：`docs/word/`  
- PDF 輸出目錄：`docs/pdf/`  

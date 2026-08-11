# Documentation Index

| Language | User Guide (Markdown) | Technical Guide (Markdown) | User Guide (Word) | Technical Guide (Word) |
| --- | --- | --- | --- | --- |
| 繁體中文 | [USER_GUIDE.zh-TW.md](./USER_GUIDE.zh-TW.md) | [TECHNICAL.zh-TW.md](./TECHNICAL.zh-TW.md) | [word/USER_GUIDE.zh-TW.docx](./word/USER_GUIDE.zh-TW.docx) | [word/TECHNICAL.zh-TW.docx](./word/TECHNICAL.zh-TW.docx) |
| English | [USER_GUIDE.en.md](./USER_GUIDE.en.md) | [TECHNICAL.en.md](./TECHNICAL.en.md) | [word/USER_GUIDE.en.docx](./word/USER_GUIDE.en.docx) | [word/TECHNICAL.en.docx](./word/TECHNICAL.en.docx) |

Also available: [word/Documentation-Index.docx](./word/Documentation-Index.docx)

- **User Guide**: CDN URLs, NetSuite admin setup, schedule, FAQ  
- **Technical Guide**: architecture, CSV/JSON contract, Actions, how to change download / transform / SuiteScript logic  

## Regenerate Word files

After editing Markdown, rebuild `.docx`:

```bash
python3 -m pip install -r requirements.txt
python3 scripts/md_to_docx.py
```

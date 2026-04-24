import { useState, useRef, useCallback, useEffect } from "react";

const BASE_INSTRUCTIONS = `You are a note-taking assistant for Dat, a venture capital investor at Lightspeed Venture Partners focused on Southeast Asia. Convert all provided source material into Dat's specific markdown note format.

### Shared rules (apply to all modes)
- Use # (H1) for the company name ONLY — no other headers
- Date as plain text on the line after H1 — format: DD Month YYYY (e.g., 6 April 2026)
- All content in bullet points using - with 4-space indentation for nested bullets
- Section labels are inline within bullets, followed by a colon — never use sub-headers
- Write for a smart generalist — no jargon, no acronyms without explanation
- Concrete and specific: exact numbers always ($3M ARR, 1,400 customers, 20% MoM growth)
- Factual only — no opinions, no editorializing, no subjective qualifiers
- NO bold, italic, or any text emphasis within bullets
- Omit any section for which there is no data — never fabricate or guess
- Fundraising always closes the note
- Do NOT include a Team section

### Founder format: Name. Role/background summary — use "Ex" prefix for former roles (e.g., "Ex Facebook", "ex CTO at Menyala")
### Numbers: use $ with M/K suffixes (e.g., $3.4M, $300K). Use ARR, MRR, AUM without spelling out.

### Fundraising format:
- Funding history: Raised $Xtotal across [N] rounds; most recent was $X [Series X] at $Y valuation from [lead investor] in [month year]
- Current raise: Now raising $X at $Y pre-money; [use of funds in one short phrase e.g. "to expand into SEA"]
- If only one prior round: Raised $X [Series X] at $Y valuation from [investors] in [month year]
- If no prior rounds: omit the funding history line entirely

### What to NEVER include: Summary, Key Takeaways, Action Items, Next Steps, Team section, any introductory text before the first bullet, headers beyond the company name H1.

If a Granola meeting link or ID is provided, use the Granola MCP tools to fetch the full transcript and use it as primary source material. Extract the meeting ID from the URL if needed (e.g., from https://notes.granola.ai/meetings/abc123, the ID is abc123).

If web search is enabled, search for publicly available information about the company (funding, founders, product, metrics) to enrich the notes.

Output ONLY the formatted markdown notes. No preamble. No explanation. No metadata.`;

const NORMAL_STRUCTURE = `
## Note structure — use this skeleton:
# Company Name

DD Month YYYY

- Founder Name(s). Background summary

- One-line company description — always begins with the company name, e.g. "Notion is a…", "Stripe is a…"

- Context:
    - The core problem they're solving — written in plain English so anyone can immediately grasp why it matters and who suffers from it today
    - Keep it human: describe the pain as a real person would experience it, not as a market opportunity
    - Supporting data points (market size, frequency of the problem, "why now")

- What it does / How it works:
    - Describe what the product actually does in the simplest possible terms — as if explaining to someone who has never heard of this category
    - Use everyday analogies and comparisons to familiar things (e.g. "think of it like X but for Y")
    - Focus on what the user does and gets, not on the underlying technology

- Traction:
    - Key metrics (ARR, users, growth rate, conversion rates)
    - Notable customers or contracts

- Business model:
    - How the company makes money — pricing model, who pays, how much

- GTM:
    - How they acquire customers — key channels, distribution strategy, partnerships

- Funding history: all prior rounds summarised

- Current raise: Now raising $X at $Y pre-money; use of funds
`;

const CONCISE_STRUCTURE = `
## Note structure — CONCISE MODE. Every section is capped at 1–2 bullets max. Be ruthlessly brief.
# Company Name

DD Month YYYY

- Founder Name(s). Background (one line)

- One-line description — begins with company name, e.g. "Notion is a…"

- Context: 1–2 bullets — core problem in plain English + one "why now" data point

- What it does: 1–2 bullets — simplest possible explanation using analogies

- Traction: key numbers only (ARR, users, growth rate) — max 3 bullets

- Business model: one bullet on how they make money

- GTM: one bullet on how they acquire customers

- Funding history: one bullet summarising all prior rounds

- Current raise: one bullet — size, valuation, use of funds
`;

const getSystemPrompt = (concise) =>
  (concise ? CONCISE_STRUCTURE : NORMAL_STRUCTURE) + "\n\n" + BASE_INSTRUCTIONS;

const fileExtMap = {
  pdf: "PDF",
  pptx: "PPT",
  xlsx: "XLS",
  xls: "XLS",
  csv: "CSV",
  txt: "TXT",
  md: "MD",
};

const ALLOWED_EXTS = Object.keys(fileExtMap);

export default function NoteGenerator() {
  const [companyName, setCompanyName] = useState("");
  const [webSearch, setWebSearch] = useState(true);
  const [granolaLink, setGranolaLink] = useState("");
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([""]);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [concise, setConcise] = useState(false);
  const [scriptsReady, setScriptsReady] = useState(false);
  const [markedReady, setMarkedReady] = useState(false);
  const fileInputRef = useRef(null);
  const outputRef = useRef(null);

  useEffect(() => {
    let loaded = 0;
    const total = 3;
    const onLoad = () => {
      loaded++;
      if (loaded >= total - 1) setScriptsReady(true); // jszip + xlsx
      if (loaded >= total) setMarkedReady(true);
    };
    const loadScript = (src) => {
      if (document.querySelector(`script[src="${src}"]`)) { onLoad(); return; }
      const s = document.createElement("script");
      s.src = src;
      s.onload = onLoad;
      s.onerror = onLoad;
      document.head.appendChild(s);
    };
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js");
  }, []);

  useEffect(() => {
    if (output && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [output]);

  const processFile = async (file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "pdf") {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ type: "pdf", name: file.name, data: e.target.result.split(",")[1] });
        reader.onerror = () => resolve({ type: "text", name: file.name, data: `[Could not read ${file.name}]` });
        reader.readAsDataURL(file);
      });
    }
    if (ext === "xlsx" || ext === "xls") {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const XLSX = window.XLSX;
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
            let text = `[Excel: ${file.name}]\n\n`;
            wb.SheetNames.forEach((name) => {
              text += `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}\n\n`;
            });
            resolve({ type: "text", name: file.name, data: text });
          } catch (err) {
            resolve({ type: "text", name: file.name, data: `[Could not parse ${file.name}: ${err.message}]` });
          }
        };
        reader.onerror = () => resolve({ type: "text", name: file.name, data: `[Could not read ${file.name}]` });
        reader.readAsArrayBuffer(file);
      });
    }
    if (ext === "pptx") {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const JSZip = window.JSZip;
            const zip = await JSZip.loadAsync(e.target.result);
            const slideFiles = Object.keys(zip.files)
              .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
              .sort((a, b) => {
                const n = (s) => parseInt(s.match(/(\d+)\.xml$/)?.[1] || "0");
                return n(a) - n(b);
              });
            let text = `[PowerPoint: ${file.name}]\n\n`;
            for (const sf of slideFiles) {
              const xml = await zip.files[sf].async("text");
              const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
              const slideText = matches.map((m) => m.replace(/<[^>]+>/g, "").trim()).filter(Boolean).join(" ");
              if (slideText) text += slideText + "\n";
            }
            resolve({ type: "text", name: file.name, data: text });
          } catch (err) {
            resolve({ type: "text", name: file.name, data: `[Could not parse ${file.name}: ${err.message}]` });
          }
        };
        reader.onerror = () => resolve({ type: "text", name: file.name, data: `[Could not read ${file.name}]` });
        reader.readAsArrayBuffer(file);
      });
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve({ type: "text", name: file.name, data: `[File: ${file.name}]\n${e.target.result}` });
      reader.onerror = () => resolve({ type: "text", name: file.name, data: `[Could not read ${file.name}]` });
      reader.readAsText(file);
    });
  };

  const addFiles = useCallback((newFiles) => {
    const valid = Array.from(newFiles).filter((f) =>
      ALLOWED_EXTS.includes(f.name.split(".").pop().toLowerCase())
    );
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...valid.filter((f) => !existing.has(f.name))];
    });
  }, []);

  const removeFile = useCallback((name) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const canGenerate = !!(companyName.trim() || granolaLink.trim() || files.length > 0 || links.some(l => l.trim()));

  const generate = async () => {
    if (!canGenerate || loading) return;
    const needsScripts = files.some((f) => ["xlsx", "xls", "pptx"].includes(f.name.split(".").pop().toLowerCase()));
    if (needsScripts && !scriptsReady) {
      setError("File parsers are still loading — please try again in a moment.");
      return;
    }
    setLoading(true);
    setError("");
    setOutput("");
    setStatusMsg("Processing files…");

    try {
      const processed = await Promise.all(files.map(processFile));
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

      let userText = `Today's date: ${dateStr}\n\n`;
      if (companyName) userText += `Company name: ${companyName}\n\n`;
      if (granolaLink) {
        userText += `Granola meeting link: ${granolaLink}\nPlease use the Granola tools to fetch the full meeting transcript and use it as source material.\n\n`;
      }

      const contentBlocks = [];
      processed.forEach((f) => {
        if (f.type === "pdf") {
          contentBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data }, title: f.name });
        } else {
          userText += `=== ${f.name} ===\n${f.data}\n\n`;
        }
      });

      const validLinks = links.map(l => l.trim()).filter(Boolean);
      if (validLinks.length > 0) {
        userText += `Additional reference links (use web search to fetch and read each one):\n${validLinks.map(l => `- ${l}`).join("\n")}\n\n`;
      }

      if (webSearch) userText += `\nPlease use web search to find publicly available information about this company and incorporate it into the notes.\n`;
      userText += `\nGenerate notes in my style based on all information above.`;

      contentBlocks.unshift({ type: "text", text: userText });

      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: getSystemPrompt(concise),
        messages: [{ role: "user", content: contentBlocks }],
      };

      if (webSearch || validLinks.length > 0) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
      if (granolaLink) body.mcp_servers = [{ type: "url", url: "https://mcp.granola.ai/mcp", name: "granola" }];

      setStatusMsg(granolaLink ? "Fetching Granola transcript…" : validLinks.length > 0 ? "Fetching links…" : webSearch ? "Searching the web…" : "Generating notes…");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `API error ${res.status}`);
      if (data.error) throw new Error(data.error.message);

      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      setOutput(text);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMd = () => {
    const filename = (companyName.trim() || "notes").replace(/[^a-z0-9_-]/gi, "_") + ".md";
    const blob = new Blob([output], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderMarkdown = (md) => {
    if (window.marked) {
      return { __html: window.marked.parse(md) };
    }
    return null;
  };

  const s = {
    root: {
      minHeight: "100vh",
      background: "#070c14",
      color: "#d4dff0",
      fontFamily: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
      padding: "0",
    },
    inner: { maxWidth: 680, margin: "0 auto", padding: "40px 24px 80px" },
    header: {
      marginBottom: 44,
      borderBottom: "1px solid #131e30",
      paddingBottom: 24,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
    },
    eyebrow: { fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#c8922e", marginBottom: 8 },
    title: { fontSize: 26, fontWeight: 400, letterSpacing: "-0.01em", color: "#e8edf8", fontFamily: "'Georgia', serif" },
    section: { marginBottom: 16 },
    label: { fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a6080", marginBottom: 8, display: "block" },
    input: {
      width: "100%",
      background: "#0b1220",
      border: "1px solid #1a2840",
      borderRadius: 6,
      padding: "11px 14px",
      color: "#c8d8f0",
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      outline: "none",
      boxSizing: "border-box",
      transition: "border-color 0.15s",
    },
    toggleRow: {
      background: "#0b1220",
      border: "1px solid #1a2840",
      borderRadius: 6,
      padding: "14px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      cursor: "pointer",
    },
    toggleLeft: { display: "flex", flexDirection: "column", gap: 4 },
    toggleTitle: { fontSize: 13, color: "#c8d8f0", fontWeight: 400 },
    toggleSub: { fontSize: 11, color: "#3a5070" },
    dropzone: (active) => ({
      background: active ? "#0f1a28" : "#0b1220",
      border: `1px dashed ${active ? "#c8922e" : "#1e3050"}`,
      borderRadius: 6,
      padding: "28px 20px",
      textAlign: "center",
      cursor: "pointer",
      transition: "all 0.15s",
    }),
    dropText: { fontSize: 12, color: "#3a5070", lineHeight: 1.6 },
    dropAccent: { color: "#c8922e", cursor: "pointer" },
    dropTypes: { fontSize: 10, color: "#28405a", marginTop: 6, letterSpacing: "0.08em" },
    fileList: { marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 },
    fileChip: {
      display: "flex", alignItems: "center", gap: 6,
      background: "#0f1e32", border: "1px solid #1e3452", borderRadius: 4,
      padding: "4px 8px 4px 10px", fontSize: 11, color: "#7a9ab8",
    },
    chipExt: { fontSize: 9, letterSpacing: "0.1em", color: "#c8922e", fontWeight: 500 },
    removeBtn: { background: "none", border: "none", color: "#3a5070", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px", fontFamily: "inherit" },
    divider: { height: 1, background: "#0f1a28", margin: "20px 0" },
    generateBtn: (disabled) => ({
      width: "100%",
      padding: "14px",
      background: disabled ? "#1a2840" : "#c8922e",
      color: disabled ? "#3a5070" : "#07090e",
      border: "none",
      borderRadius: 6,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      fontWeight: 500,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "all 0.15s",
    }),
    status: { display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#4a6080", marginTop: 12, letterSpacing: "0.05em" },
    spinner: {
      width: 12, height: 12,
      border: "2px solid #1a2840", borderTopColor: "#c8922e",
      borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0,
    },
    outputCard: { background: "#0b1220", border: "1px solid #1a2840", borderRadius: 6, marginTop: 28 },
    outputHeader: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px", borderBottom: "1px solid #131e30",
    },
    outputLabel: { fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#c8922e" },
    copyBtn: (active) => ({
      background: "none",
      border: `1px solid ${active ? "#c8922e" : "#1a2840"}`,
      borderRadius: 4,
      padding: "5px 12px",
      color: active ? "#c8922e" : "#4a6080",
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      cursor: "pointer",
      transition: "all 0.15s",
    }),
    errorBox: { background: "#120808", border: "1px solid #3d1010", borderRadius: 6, padding: "12px 14px", fontSize: 12, color: "#d06060", marginTop: 12 },
  };

  const html = output ? renderMarkdown(output) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea:focus, input:focus { border-color: #c8922e !important; }
        .gen-btn:hover:not(:disabled) { background: #d9a040 !important; }
        .copy-btn:hover { border-color: #c8922e !important; color: #c8922e !important; }
        .remove-btn:hover { color: #d06060 !important; }
        .dropzone:hover { border-color: #c8922e !important; }
        .toggle-row:hover { border-color: #2a4060 !important; }

        .md-output {
          padding: 24px 24px 20px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          line-height: 1.85;
          color: #b8ccec;
        }
        .md-output h1 {
          font-size: 20px;
          font-weight: 500;
          color: #e8edf8;
          font-family: 'Georgia', serif;
          margin: 0 0 4px;
          letter-spacing: -0.01em;
        }
        .md-output p {
          margin: 0 0 2px;
          color: #7a90a8;
          font-size: 12px;
        }
        .md-output ul {
          list-style: none;
          padding: 0;
          margin: 14px 0 0;
        }
        .md-output ul li {
          position: relative;
          padding-left: 16px;
          margin-bottom: 6px;
          color: #b8ccec;
        }
        .md-output ul li::before {
          content: '-';
          position: absolute;
          left: 0;
          color: #3a5a78;
        }
        .md-output ul ul {
          margin: 6px 0 4px;
          padding-left: 20px;
        }
        .md-output ul ul li {
          color: #8aaccc;
          margin-bottom: 4px;
          font-size: 12.5px;
        }
        .md-output ul ul li::before {
          color: #2a4058;
        }
        .md-output strong { font-weight: 500; color: #c8d8f0; }
        .md-output a { color: #c8922e; text-decoration: none; }
        .md-output a:hover { text-decoration: underline; }
      `}</style>
      <div style={s.root}>
        <div style={s.inner}>

          {/* Header */}
          <div style={s.header}>
            <div>
              <div style={s.eyebrow}>Lightspeed Venture Partners</div>
              <div style={s.title}>Note Generator</div>
            </div>
          </div>

          {/* Company Name */}
          <div style={s.section}>
            <label style={s.label}>Company</label>
            <input
              style={s.input}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Notion"
              onKeyDown={(e) => e.key === "Enter" && generate()}
            />
          </div>

          {/* Granola Link */}
          <div style={s.section}>
            <label style={s.label}>Granola Call Notes</label>
            <input
              style={s.input}
              value={granolaLink}
              onChange={(e) => setGranolaLink(e.target.value)}
              placeholder="Paste Granola meeting link or ID"
            />
          </div>

          {/* File Upload */}
          <div style={s.section}>
            <label style={s.label}>Additional Files</label>
            <div
              className="dropzone"
              style={s.dropzone(dragActive)}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={s.dropText}>Drop files here or <span style={s.dropAccent}>browse</span></div>
              <div style={s.dropTypes}>PDF · PPTX · XLSX · CSV · TXT · MD</div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.pptx,.xlsx,.xls,.csv,.txt,.md"
              style={{ display: "none" }}
              onChange={(e) => addFiles(e.target.files)}
            />
            {files.length > 0 && (
              <div style={s.fileList}>
                {files.map((f) => {
                  const ext = f.name.split(".").pop().toLowerCase();
                  return (
                    <div key={f.name} style={s.fileChip}>
                      <span style={s.chipExt}>{fileExtMap[ext] || ext.toUpperCase()}</span>
                      <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <button className="remove-btn" style={s.removeBtn} onClick={(e) => { e.stopPropagation(); removeFile(f.name); }} title="Remove">×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Additional Links */}
          <div style={s.section}>
            <label style={s.label}>Additional Links</label>
            {links.map((link, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  value={link}
                  onChange={(e) => setLinks(prev => prev.map((l, j) => j === i ? e.target.value : l))}
                  placeholder="https://crunchbase.com/…  or  LinkedIn, news articles, etc."
                />
                {links.length > 1 && (
                  <button className="remove-btn" style={{ ...s.removeBtn, fontSize: 18, padding: "0 8px", color: "#3a5070" }}
                    onClick={() => setLinks(prev => prev.filter((_, j) => j !== i))}>×</button>
                )}
              </div>
            ))}
            <button
              style={{ background: "none", border: "none", color: "#c8922e", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.1em", cursor: "pointer", padding: "4px 0", marginTop: 2 }}
              onClick={() => setLinks(prev => [...prev, ""])}
            >+ Add link</button>
          </div>

          {/* Options */}
          <div style={s.section}>
            <label style={s.label}>Options</label>
            <div className="toggle-row" style={{ ...s.toggleRow, marginBottom: 8 }} onClick={() => setWebSearch((v) => !v)}>
              <div style={s.toggleLeft}>
                <span style={s.toggleTitle}>Enhance with public information</span>
                <span style={s.toggleSub}>Search the web for funding, metrics, and founder backgrounds</span>
              </div>
              <div style={{ width: 40, height: 22, background: webSearch ? "#c8922e" : "#1a2840", borderRadius: 22, position: "relative", transition: "background 0.2s", flexShrink: 0, border: `1px solid ${webSearch ? "#c8922e" : "#2a4060"}` }}>
                <div style={{ position: "absolute", top: 3, left: webSearch ? 19 : 3, width: 14, height: 14, background: webSearch ? "#fff" : "#3a5070", borderRadius: "50%", transition: "left 0.2s, background 0.2s" }} />
              </div>
            </div>
            <div className="toggle-row" style={s.toggleRow} onClick={() => setConcise((v) => !v)}>
              <div style={s.toggleLeft}>
                <span style={s.toggleTitle}>Concise mode</span>
                <span style={s.toggleSub}>Shorter notes — max 1–2 bullets per section</span>
              </div>
              <div style={{ width: 40, height: 22, background: concise ? "#c8922e" : "#1a2840", borderRadius: 22, position: "relative", transition: "background 0.2s", flexShrink: 0, border: `1px solid ${concise ? "#c8922e" : "#2a4060"}` }}>
                <div style={{ position: "absolute", top: 3, left: concise ? 19 : 3, width: 14, height: 14, background: concise ? "#fff" : "#3a5070", borderRadius: "50%", transition: "left 0.2s, background 0.2s" }} />
              </div>
            </div>
          </div>

          <div style={s.divider} />

          {/* Generate */}
          <button className="gen-btn" style={s.generateBtn(!canGenerate || loading)} disabled={!canGenerate || loading} onClick={generate}>
            {loading ? "Generating…" : "Generate Notes"}
          </button>

          {loading && statusMsg && (
            <div style={s.status}>
              <div style={s.spinner} />
              {statusMsg}
            </div>
          )}

          {error && <div style={s.errorBox}>Error: {error}</div>}

          {/* Output */}
          {output && (
            <div ref={outputRef} style={s.outputCard}>
              <div style={s.outputHeader}>
                <span style={s.outputLabel}>Generated Notes</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="copy-btn" style={s.copyBtn(copied)} onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
                  <button className="copy-btn" style={s.copyBtn(false)} onClick={downloadMd}>Download .md</button>
                </div>
              </div>
              {html
                ? <div className="md-output" dangerouslySetInnerHTML={html} />
                : <div style={{ padding: "20px", fontSize: 13, lineHeight: 1.8, color: "#b8ccec", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'JetBrains Mono', monospace" }}>{output}</div>
              }
            </div>
          )}

        </div>
      </div>
    </>
  );
}

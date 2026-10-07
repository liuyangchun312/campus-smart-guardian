import { useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, Check, FileSearch, LibraryBig, Search, ShieldCheck } from "lucide-react";
import { knowledgeSources, retrieveEvidence } from "../../shared/knowledge.mjs";
import type { EvidenceSource } from "../../shared/knowledge.mjs";
import "./knowledge.css";

const kindLabels = { policy: "政策与办事", safety: "职业安全", method: "研究方法" };

export function RetrievedSources({ sources }: { sources: EvidenceSource[] }) {
  // Stored conversations can outlive a corpus edit. Render the maintained source
  // fields, not arbitrary or stale text attached to an otherwise known ID.
  const trusted = sources.reduce<EvidenceSource[]>((result, source) => {
    const known = knowledgeSources.find((entry) => entry.id === source.id && entry.url === source.url);
    if (known && !result.some((entry) => entry.id === known.id)) result.push(known);
    return result;
  }, []);
  if (!trusted.length) return <p className="evidence-empty"><FileSearch size={14} />精选资料库暂未找到匹配依据，请核实答复中的规则与来源。</p>;
  return (
    <details className="message-evidence">
      <summary><BookOpen size={15} /><span>本次检索到 {trusted.length} 条参考来源</span><span className="evidence-summary-hint">查看依据与适用范围</span></summary>
      <div className="evidence-details">
        <p className="evidence-caveat">以下是应用检索到的人工摘要，不是模型逐句引用，也不代表答复已被来源证实。</p>
        <ol>
          {trusted.map((source) => <li key={source.id}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ArrowUpRight size={13} /></a>
            <span className="evidence-publisher">{source.source}</span>
            <p>{source.excerpt}</p>
            <p className="evidence-scope"><strong>适用边界：</strong>{source.applicability}</p>
          </li>)}
        </ol>
      </div>
    </details>
  );
}

function consultationPrompt(source: EvidenceSource) {
  if (source.id === "electrical-safety")
    return "如何预防电气作业中的冒烟、火花与漏电风险？请结合参考资料说明日常防护、专业人员的职责和需要立即撤离的情形。";
  if (source.id === "chemical-cleaning")
    return "84消毒液能和洁厕灵混用吗？请结合参考资料说明日常使用注意事项。";
  if (source.id === "niosh-controls")
    return "请用NIOSH控制层级说明如何选择作业安全整改措施，以及方法的适用边界。";
  if (source.id === "labor-evidence")
    return "劳动争议准备仲裁时，需要保留哪些证据？请说明需要核实的信息和操作步骤。";
  return `请结合“${source.title}”的参考资料，说明适用前提、我需要核实的信息和操作步骤。`;
}

export default function Knowledge({ ask }: { ask: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | EvidenceSource["kind"]>("all");
  const results = useMemo(() => (query.trim() ? retrieveEvidence(query, { limit: 9 }) : knowledgeSources)
    .filter((source) => kind === "all" || source.kind === kind), [query, kind]);
  return (
    <div className="knowledge-page page-enter">
      <div className="page-heading"><div><span className="eyebrow">有出处的建议，才经得起追问</span><h1>依据与方法库 <LibraryBig size={25} /></h1><p>从政策原文到研究方法，看清建议从哪里来、适用到哪里。</p></div></div>
      <section className="knowledge-intro" aria-label="资料库说明">
        <div className="knowledge-intro-main"><span className="knowledge-kicker">EVIDENCE / 精选资料</span><h2>把每一个建议<br />放回它的依据里。</h2><p>劳动规则、职业安全与检索方法汇集在这里。搜索具体问题，阅读整理摘要，再打开原文核实。</p><div className="knowledge-intro-meta"><span><Check size={14} />保留公开原文链接</span><span><ShieldCheck size={14} />标明适用边界</span></div></div>
        <div className="knowledge-stats"><strong>{knowledgeSources.length.toString().padStart(2, "0")}</strong><span>条精选资料</span><p>人工摘要 · 本地检索<br />可离线查询摘要</p><small>不含实时法规更新</small></div>
      </section>
      <section className="knowledge-search-section" aria-label="查询依据">
        <label htmlFor="evidence-query">用问题找依据</label>
        <div className="knowledge-search"><Search size={19} /><input id="evidence-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} placeholder="试试：加班费、消毒剂混用、控制层级…" />{query && <button onClick={() => setQuery("")} aria-label="清空依据搜索">清空</button>}</div>
        <div className="knowledge-examples"><span>常用检索</span>{["加班费", "勤工助学", "消毒剂混用", "控制层级"].map((value) => <button key={value} onClick={() => { setQuery(value); setKind("all"); }}>{value}<ArrowUpRight size={12} /></button>)}</div>
      </section>
      <div className="knowledge-results-toolbar"><div className="knowledge-filters" aria-label="资料类型">{(["all", "policy", "safety", "method"] as const).map((value) => <button key={value} aria-pressed={kind === value} className={kind === value ? "active" : ""} onClick={() => setKind(value)}>{value === "all" ? "全部资料" : kindLabels[value]}</button>)}</div><p role="status">{query.trim() ? "按关键词相关性排列" : "精选资料目录"} · {results.length} 条</p></div>
      {results.length ? <div className="knowledge-results">{results.map((source, index) => <article className="knowledge-card" key={source.id}>
        <div className="knowledge-card-index">{String(index + 1).padStart(2, "0")}</div>
        <div className="knowledge-card-body"><div className="knowledge-card-tags"><span>{kindLabels[source.kind]}</span><span>人工整理摘要</span></div><h2>{source.title}</h2><p className="knowledge-source-name">{source.source}</p><p className="knowledge-excerpt">{source.excerpt}</p><div className="knowledge-applicability"><ShieldCheck size={16} /><p><strong>适用边界</strong>{source.applicability}</p></div><div className="knowledge-card-actions"><a href={source.url} target="_blank" rel="noopener noreferrer">查看公开原文<ArrowUpRight size={15} /></a>{source.kind !== "method" && <button onClick={() => ask(consultationPrompt(source))}>结合我的情况咨询<ArrowUpRight size={14} /></button>}</div></div>
      </article>)}</div> : <div className="knowledge-no-results"><FileSearch size={34} /><h2>这次没有找到匹配资料</h2><p>当前资料范围有限。可改用具体主题词，或切换到全部资料；没有结果不代表相关规则不存在。</p><button className="button outline" onClick={() => { setQuery(""); setKind("all"); }}>查看全部资料</button></div>}
      <section className="knowledge-method" aria-label="实现方法与限制"><div><span className="knowledge-kicker">从文献到功能</span><h2>方法有依据，能力有边界。</h2></div><div className="knowledge-method-notes"><p><strong>01 / 检索排序</strong>借鉴 Robertson 与 Zaragoza（2009）的 BM25。中文按相邻双字、英文按单词切分，以词频、逆文档频率和长度归一化排序（k1=1.2，b=0.75），辅以领域词过滤。相关性分数不是可信度。</p><p><strong>02 / 参考资料辅助回答</strong>借鉴 Lewis 等（2020）的检索增强生成思路。连接 AI 后，由服务端检索最多3条摘要并提供给模型；来源卡片由应用独立展示。当前实现不复现论文的稠密检索与联合训练。</p><p><strong>03 / 安全措施设计</strong>借鉴 NIOSH 的控制层级，优先考虑消除、替代和工程措施，再补充管理与个人防护。它是方法参考，并非中国法定风险分级标准。</p></div><p className="knowledge-method-limit">这是小型精选资料库，不是完整法律数据库。摘要为项目整理，不是法规逐字引文；部分公开站点可能要求浏览器验证，个案适用性与现行版本请到原站或主管部门核实。</p></section>
    </div>
  );
}

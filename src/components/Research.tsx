import { ArrowUpRight, BookOpen, Check, Copy, FlaskConical } from "lucide-react";
import type { Page } from "../types";
import "./workbench.css";

const references = [
  { id: "01", type: "检索方法 / 2009", title: "The Probabilistic Relevance Framework: BM25 and Beyond", authors: "Robertson, S.; Zaragoza, H.", publication: "Foundations and Trends in Information Retrieval, 4(1–2), 1–174.", url: "https://doi.org/10.1561/1500000019", doi: "10.1561/1500000019", use: "对问题与资料进行词项匹配和相关性排序，让政策检索在不连接模型时也能工作。", boundary: "中文分词与小型资料库是工程适配。相关性得分不是正确率，也不判断法律是否适用。", page: "knowledge" as Page },
  { id: "02", type: "检索增强生成 / 2020", title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", authors: "Lewis, P.; Perez, E.; Piktus, A.; et al.", publication: "Advances in Neural Information Processing Systems, 33, 9459–9474.", url: "https://arxiv.org/abs/2005.11401", doi: "arXiv:2005.11401", use: "模型回答前先检索资料，将摘要与来源作为参考上下文，并在答复旁独立展示检索来源。", boundary: "采用检索增强的设计思想；本项目使用词法检索与外部模型，没有复现论文的稠密检索、联合训练或性能结果。", page: "chat" as Page },
  { id: "03", type: "风险评估综述 / 2013", title: "Risk evaluation approaches in failure mode and effects analysis: A literature review", authors: "Liu, H.-C.; Liu, L.; Liu, N.", publication: "Expert Systems with Applications, 40(2), 828–838.", url: "https://doi.org/10.1016/j.eswa.2012.08.010", doi: "10.1016/j.eswa.2012.08.010", use: "借鉴失效模式与影响分析（FMEA），分别记录严重度、发生可能性、难检出度，解释风险优先数 RPN = S × O × D。", boundary: "1–5 级量表、分级阈值与严重度优先规则由本项目设计，用于辅助排序；不是论文规定的校园标准，不代表事故概率。", page: "safety" as Page },
  { id: "04", type: "职业安全指南 / 2024", title: "Hierarchy of Controls", authors: "National Institute for Occupational Safety and Health (NIOSH).", publication: "Centers for Disease Control and Prevention. April 10, 2024.", url: "https://www.cdc.gov/niosh/hierarchy-of-controls/about/index.html", doi: "CDC / NIOSH", use: "整改措施按消除、替代、工程控制、管理控制、个人防护依次考虑，并在整改后记录效果复查。", boundary: "指南用于控制措施设计参考，不是中国法定义务的替代依据。具体作业方案仍需由有资质人员判断。", page: "safety" as Page },
];

export default function Research({ navigate, notify }: { navigate: (page: Page) => void; notify: (text: string) => void }) {
  const copyReferences = async () => {
    try { await navigator.clipboard.writeText(references.map((r, i) => `[${i + 1}] ${r.authors} ${r.title}. ${r.publication} ${r.url}`).join("\n\n")); notify("参考文献已复制"); }
    catch { notify("无法访问剪贴板，请手动选择文献信息复制"); }
  };
  return <div className="research-page page-enter">
    <div className="page-heading"><div><span className="eyebrow">RESEARCH / 方法透明</span><h1>方法与参考文献 <FlaskConical size={25} /></h1><p>看清功能的来源，也看清方法能说明什么。</p></div><button className="button outline small" onClick={() => void copyReferences()}><Copy size={16} />复制参考文献</button></div>
    <section className="research-intro"><BookOpen size={31} strokeWidth={1.3} /><div><h2>从研究方法，到可检查的工作过程。</h2><p>本项目把检索、风险评估与控制措施转成实际工作流。文献提供设计依据；功能是否有效，需要结合本地测试和真实使用反馈验证。</p></div><span>04<span>项方法来源</span></span></section>
    <div className="research-pipeline" aria-label="方法如何连接功能">{["查找相关依据", "记录风险判断", "安排整改措施", "复查并保留记录"].map((step, i) => <div key={step}><span>0{i + 1}</span><strong>{step}</strong>{i < 3 && <ArrowUpRight size={17} />}</div>)}</div>
    <div className="research-list">{references.map((r) => <article className="research-card" key={r.id}><div className="research-index">{r.id}</div><div className="research-body"><span className="eyebrow">{r.type}</span><h2><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}<ArrowUpRight size={16} /></a></h2><p className="research-citation">{r.authors}<br />{r.publication}</p><div className="research-application"><div><h3><Check size={15} />在项目中的实现</h3><p>{r.use}</p></div><div><h3>适用边界与工程简化</h3><p>{r.boundary}</p></div></div><footer><code>{r.doi}</code><button className="text-button accent" onClick={() => navigate(r.page)}>进入对应功能<ArrowUpRight size={14} /></button></footer></div></article>)}</div>
    <section className="research-validation panel"><h2>如何核验这套实现</h2><div><p><strong>检索与回答</strong>检查查询能否找到相关资料；无匹配时明确提示；检索来源与模型生成内容分别呈现。</p><p><strong>风险与闭环</strong>检查严重风险不会被低乘积分数掩盖；整改必须填写责任、期限与措施；关闭前必须完成复查记录。</p><p><strong>统计与数据</strong>看板来自当前账号中的真实记录；空数据保持为空；逾期与完成率的统计口径可查看。</p></div><p className="research-footnote">书目信息核对：2026-10-02。论文题录通过 Crossref / arXiv 核对；NIOSH 网页已核读。FMEA 综述的出版信息已核对，未据此声称全文复现。政策适用条件请在循证检索中查看原始发布来源。</p></section>
  </div>;
}

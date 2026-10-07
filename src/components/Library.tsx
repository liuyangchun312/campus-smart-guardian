import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileText,
  Leaf,
  Search,
  ShieldCheck,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import Modal from "./Modal";
import { articles } from "../data/articles";
import type { Article } from "../types";

export default function Library({ ask }: { ask: (value: string) => void }) {
  const [filter, setFilter] = useState("全部资料");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Article | null>(null);
  const results = articles.filter(
    (article) =>
      (filter === "全部资料" || article.category === filter) &&
      `${article.title}${article.tag}${article.description}${article.content}`.includes(
        query.trim(),
      ),
  );
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <span className="eyebrow">把政策读懂，把自己护好</span>
          <h1>
            权益与安全资料库 <BookOpen size={25} />
          </h1>
          <p>从您关心的小事出发，找到看得懂、用得上的依据。</p>
        </div>
        <span className="verified-tag">
          <ShieldCheck size={16} />
          附官方原文来源
        </span>
      </div>
      <div className="library-banner">
        <div>
          <Leaf size={25} />
          <h2>权威的规定，也可以说得很明白。</h2>
          <p>精选常见问题，整理实用步骤。具体个案仍需核实适用条件。</p>
        </div>
        <BookOpen size={90} strokeWidth={0.8} />
      </div>
      <div className="library-toolbar">
        <div className="filter-tabs">
          {["全部资料", "劳动权益", "勤工助学", "劳动安全"].map((category) => (
            <button
              key={category}
              className={filter === category ? "active" : ""}
              onClick={() => setFilter(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <div className="search-field">
          <Search size={17} />
          <input
            placeholder="搜索加班、津贴、安全…"
            aria-label="搜索资料库"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="article-grid">
        {results.map((article) => (
          <button
            className="article-card panel"
            key={article.id}
            onClick={() => setSelected(article)}
          >
            <div>
              <span
                className={`article-category ${article.category === "劳动安全" ? "warm" : article.category === "勤工助学" ? "blue" : ""}`}
              >
                {article.category}
              </span>
              <FileText size={20} strokeWidth={1.4} />
            </div>
            <span className="article-tag">{article.tag}</span>
            <h2>{article.title}</h2>
            <p>{article.description}</p>
            <footer>
              <span>阅读实用指引</span>
              <ArrowUpRight size={17} />
            </footer>
          </button>
        ))}
      </div>
      {results.length === 0 && (
        <div className="empty-state panel">
          <Search size={35} />
          <h2>暂时没有找到相关资料</h2>
          <p>试试“工资”“学生”“安全”等关键词，也可以直接问小护。</p>
          <button
            className="button primary"
            onClick={() => ask(query || "我想了解劳动权益")}
          >
            问问小护
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      <p className="library-footnote">
        <ShieldCheck size={14} />
        资料整理核验日期：2026 年 10 月 1 日 ·
        政策可能调整，请以官方现行规定为准。
      </p>
      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)} wide>
          <div className="markdown article-content">
            <ReactMarkdown>{selected.content}</ReactMarkdown>
          </div>
          <a
            className="source-link"
            href={selected.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BookOpen size={19} />
            <div>
              <span>查看官方原文</span>
              <strong>{selected.source}</strong>
            </div>
            <ArrowUpRight size={19} />
          </a>
          {selected.id === "overtime" && (
            <a
              className="secondary-source"
              href="https://app.www.gov.cn/govdata/gov/202501/02/523227/article.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              工资折算依据：人社部发〔2025〕2号
              <ArrowUpRight size={13} />
            </a>
          )}
          <button
            className="button primary article-ask"
            onClick={() => {
              ask(`关于“${selected.title}”，我想了解具体怎么做。`);
              setSelected(null);
            }}
          >
            结合我的情况问一问
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}

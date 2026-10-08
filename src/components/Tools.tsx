import { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Calculator,
  Check,
  CheckCheck,
  ClipboardCheck,
  Copy,
  ExternalLink,
  HeartHandshake,
  Info,
  Phone,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import Modal from "./Modal";
import { useDeployment } from "../lib/deployment";

export default function Tools({
  tool,
  onClose,
  notify,
  draftCount,
}: {
  tool: string;
  onClose: () => void;
  notify: (value: string) => void;
  draftCount: number;
}) {
  const { storageLabel } = useDeployment();
  const [salary, setSalary] = useState("3000");
  const [hours, setHours] = useState("12");
  const [kind, setKind] = useState("1.5");
  const [checks, setChecks] = useState<number[]>([]);
  const amount = (Number(salary) / 21.75 / 8) * Number(hours) * Number(kind);
  const isValid =
    salary !== "" &&
    hours !== "" &&
    Number(salary) > 0 &&
    Number(hours) >= 0 &&
    Number(hours) <= 744 &&
    Number(salary) <= 1000000 &&
    Number.isFinite(amount);
  const evidence = [
    "劳动合同、录用通知或工牌",
    "实际用人单位与外包公司信息",
    "完整考勤打卡记录、排班表",
    "加班通知、工作安排与沟通记录",
    "工资明细、银行发薪流水",
    "按日期整理的事情经过与具体诉求",
  ];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `劳动争议证据自查清单\n${evidence.map((item, index) => `${checks.includes(index) ? "已准备" : "待准备"}：${item}`).join("\n")}\n请保留原始记录及完整上下文，勿编造证据或非法获取个人隐私。`,
      );
      notify("证据清单已复制");
    } catch {
      notify("复制失败，请手动选中清单文字复制");
    }
  };
  const titles: Record<string, string> = {
    calculator: "加班费参考计算",
    evidence: "维权证据自查清单",
    help: "需要时，这些渠道可以帮您",
    about: "认识校园智护",
    notifications: "服务提醒",
    privacy: "您的数据，您来掌握",
  };
  return (
    <Modal title={titles[tool] ?? "校园服务"} onClose={onClose}>
      {tool === "calculator" && (
        <>
          <div className="tool-intro">
            <Calculator size={22} />
            <p>
              适用于标准工时劳动关系的参考估算。特殊工时、非全日制及勤工助学岗位，请先核实适用规则。
            </p>
          </div>
          <div className="calculator-fields">
            <label className="field-label" htmlFor="salary">
              月加班工资计算基数（元）
            </label>
            <input
              id="salary"
              type="number"
              min="1"
              max="1000000"
              step="0.01"
              value={salary}
              onChange={(event) => setSalary(event.target.value)}
            />
            <p className="field-help">
              不一定等于实发工资，请结合当地规定与工资构成核实。
            </p>
            <label className="field-label" htmlFor="overtime-kind">
              加班类型
            </label>
            <select
              id="overtime-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="1.5">工作日延时 · 150%</option>
              <option value="2">休息日且不能补休 · 200%</option>
              <option value="3">法定节假日 · 300%</option>
            </select>
            <label className="field-label" htmlFor="overtime-hours">
              加班小时数
            </label>
            <input
              id="overtime-hours"
              type="number"
              min="0"
              max="744"
              step="0.5"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </div>
          <div className="calculator-result" aria-live="polite">
            <span>本次加班工资参考金额</span>
            <strong>
              {isValid ? (
                <>
                  <small>¥</small>
                  {amount.toLocaleString("zh-CN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </>
              ) : (
                "请检查输入"
              )}
            </strong>
            <p>
              {isValid
                ? `${salary} ÷ 21.75 ÷ 8 × ${hours} × ${kind}`
                : "请输入有效工资基数与 0–744 范围内的小时数。"}
            </p>
          </div>
          <p className="inline-note">
            <Info size={16} />
            该结果是对应加班部分的参考金额。已支付部分应核对扣除；计算器不判断具体加班安排是否合法。
          </p>
          <a
            className="secondary-source"
            href="https://app.www.gov.cn/govdata/gov/202501/02/523227/article.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            21.75 折算依据：人社部发〔2025〕2号
            <ExternalLink size={13} />
          </a>
          <p className="field-help">
            加班倍率依据《劳动法》第44条。重大争议请向校后勤工会或劳动仲裁机构核实。
          </p>
        </>
      )}
      {tool === "evidence" && (
        <>
          <div className="tool-intro">
            <ClipboardCheck size={22} />
            <p>
              勾选已经准备好的材料，复制清单留作提醒。勾选状态仅在本次弹窗内保留，不会上传任何材料。
            </p>
          </div>
          <div className="evidence-progress">
            <span>准备进度</span>
            <strong>
              {checks.length} / {evidence.length}
            </strong>
            <div>
              <span
                style={{ width: `${(checks.length / evidence.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="evidence-checks">
            {evidence.map((item, index) => (
              <label key={item}>
                <input
                  type="checkbox"
                  checked={checks.includes(index)}
                  onChange={() =>
                    setChecks((current) =>
                      current.includes(index)
                        ? current.filter((i) => i !== index)
                        : [...current, index],
                    )
                  }
                />
                <span className="custom-checkbox">
                  {checks.includes(index) && <Check size={14} />}
                </span>
                <span>{item}</span>
              </label>
            ))}
          </div>
          <p className="inline-note">
            <ShieldCheck size={16} />
            保留原始载体与完整上下文，避免泄露他人隐私。涉及工伤，请补充医疗记录、事故经过和证人线索。
          </p>
          <button
            className="button primary full-button"
            onClick={() => void copy()}
          >
            <Copy size={16} />
            复制我的准备清单
          </button>
        </>
      )}
      {tool === "help" && (
        <>
          <p className="modal-description">
            遇到问题不必一个人扛。先整理事实与诉求，再选择适合的求助渠道。
          </p>
          <div className="contact-card">
            <span>
              <HeartHandshake size={24} />
            </span>
            <div>
              <h3>学校后勤部门 / 校工会</h3>
              <p>
                适合协调后勤用工、工作环境和外包服务问题。联系方式请从学校官网、服务大厅或公告栏核实。
              </p>
            </div>
          </div>
          <div className="contact-card">
            <span>
              <BookOpen size={24} />
            </span>
            <div>
              <h3>学生资助 / 勤工助学管理部门</h3>
              <p>适合咨询学校组织的勤工助学岗位、报酬与安全保障。</p>
            </div>
          </div>
          <div className="contact-card">
            <span>
              <Phone size={24} />
            </span>
            <div>
              <h3>12333 · 人力资源和社会保障咨询</h3>
              <p>
                可咨询劳动政策及当地投诉、调解、仲裁办理渠道；是否直接受理投诉以当地安排为准。
              </p>
              <a href="tel:12333">
                拨打 12333
                <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
          <div className="emergency-contact">
            <strong>发生危险，请优先直接求助</strong>
            <div>
              <a href="tel:119">
                火警 / 应急救援 <b>119</b>
              </a>
              <a href="tel:120">
                医疗急救 <b>120</b>
              </a>
            </div>
            <p>本应用不能代拨电话或通知救援。</p>
          </div>
        </>
      )}
      {tool === "about" && (
        <div className="about-content">
          <span className="brand-mark large">
            <Sprout size={40} />
          </span>
          <h3>
            每一份劳动，
            <br />
            都值得被好好守护。
          </h3>
          <p>
            校园智护面向保洁、宿管、维修、绿化、食堂等后勤劳动者，以及勤工助学学生，提供政策解惑、权益指引、工单整理与劳动安全参考。
          </p>
          <div className="about-values">
            <span>
              <ShieldCheck size={18} />
              说得明白
            </span>
            <span>
              <CheckCheck size={18} />
              用得顺手
            </span>
            <span>
              <HeartHandshake size={18} />
              想得周到
            </span>
          </div>
          <p className="inline-note">
            本项目为校园服务场景演示，不代表学校官方平台。未配置 AI
            服务时使用本地参考问答，提交的报修由本站校方管理员受理。
          </p>
        </div>
      )}
      {tool === "notifications" && (
        <>
          <div className="notification-item">
            <ClipboardCheck size={22} />
            <div>
              <h3>
                {draftCount
                  ? `您有 ${draftCount} 张工单待提交学校`
                  : "目前没有待提交的工单"}
              </h3>
              <p>在工单详情点击“提交给学校”，提交后可查看受理和处理进度。</p>
            </div>
          </div>
          <div className="notification-item">
            <ShieldCheck size={22} />
            <div>
              <h3>保护好您的个人信息</h3>
              <p>
                咨询时不必提供身份证号、银行卡号等敏感资料。公用电脑上使用后，请退出账号。
              </p>
            </div>
          </div>
          <div className="notification-item">
            <HeartHandshake size={22} />
            <div>
              <h3>小护陪您，也请及时寻求专业帮助</h3>
              <p>
                遇到现场险情优先撤离并联系应急人员；重大劳动争议请向工会或劳动仲裁机构核实。
              </p>
            </div>
          </div>
        </>
      )}
      {tool === "privacy" && (
        <>
          <div className="tool-intro">
            <ShieldCheck size={23} />
            <p>
              记录按账号保存在{storageLabel}中。校方管理员可查看您明确提交的报修工单，私人咨询和未提交草稿不进入校方队列。
            </p>
          </div>
          <div className="privacy-copy">
            <h3>本地参考问答</h3>
            <p>
              使用本地知识规则整理常见问题，无需把咨询内容发送到外部 AI 服务。
            </p>
            <h3>连接 AI 服务时</h3>
            <p>
              您发送的问题及最近对话会经账号服务转发到已配置的 AI
              服务商。请勿输入敏感个人信息。页面会标明当前连接状态。
            </p>
            <h3>删除与保存</h3>
            <p>
              在咨询页点击“新对话”可清除对话记录，未提交的工单可删除。已提交工单保留校方与用户的处理记录。巡检可导出单条Markdown，运行看板可导出当前范围CSV。退出登录或清除浏览器数据不会删除账号中的服务器记录。账号菜单可修改密码、导出备份，或导入升级前的浏览器记录。
            </p>
          </div>
        </>
      )}
    </Modal>
  );
}

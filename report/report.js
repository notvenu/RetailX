// Builds the RetailX capstone report (VIT-AP format) as .docx. Word then updates the TOC fields and exports PDF.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, Footer, PageNumber, NumberFormat,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, ImageRun, TableOfContents, SequentialIdentifier,
  LevelFormat, TabStopType, VerticalAlign, StyleLevel,
} = require("docx");

const FIG = path.join(__dirname, "fig");
const ML = "d:/Coding/Projects/RetailX/ml/models";
const metrics = JSON.parse(fs.readFileSync(path.join(ML, "metrics.json"), "utf8"));
const f2d = JSON.parse(fs.readFileSync(path.join(ML, "f2d.json"), "utf8"));
const FONT = "Times New Roman";
const W = 8666; // A4 width minus 1.25" + 1" margins, in DXA

/* ---------------- building blocks ---------------- */
const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 24, ...o });
// **bold** inline markup
const runs = (s, o = {}) => s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((p) => (p.startsWith("**") ? run(p.slice(2, -2), { ...o, bold: true }) : run(p, o)));
const P = (s, o = {}) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: 360, after: 160 }, indent: o.noIndent ? undefined : { firstLine: 720 }, children: runs(s), ...o.p });
const Plain = (s, o = {}) => P(s, { noIndent: true, ...o });
const center = (s, o = {}, sp = 120) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: sp }, children: [run(s, o)] });
const H1 = (s) => new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: s })] });
const H2 = (s) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: s })] });
const H3 = (s) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: s })] });
const chapter = (n, title) => [new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [run(`CHAPTER ${n}`, { bold: true, size: 28 })] }), H1(title)];
const front = (title) => new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: true, children: [new TextRun({ text: title })] });
const bullet = (s) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { line: 360, after: 80 }, children: runs(s) });
const num = (s, ref = "steps") => new Paragraph({ numbering: { reference: ref, level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { line: 360, after: 80 }, children: runs(s) });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

function png(file) {
  const b = fs.readFileSync(path.join(FIG, file));
  return { data: b, w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function figure(file, caption, widthIn = 6) {
  const img = png(file);
  const w = widthIn * 96, h = Math.round((w * img.h) / img.w);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 }, children: [new ImageRun({ type: "png", data: img.data, transformation: { width: w, height: h } })] }),
    new Paragraph({ style: "FigCaption", alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun(`Figure ${++nFig} ${caption}`)] }),
  ];
}
/** The university's logo, centred, no caption. */
function logo(file, widthIn, extra = {}, after = 240) {
  const img = png(file), w = widthIn * 96, h = Math.round((w * img.h) / img.w);
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after }, ...extra, children: [new ImageRun({ type: "png", data: img.data, transformation: { width: w, height: h } })] });
}
const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const borders = { top: border, bottom: border, left: border, right: border };
function table(caption, head, rows, widths, numbered = true) {
  const sum = widths.reduce((a, b) => a + b, 0);
  const ws = widths.map((x) => Math.round((x / sum) * W));
  ws[ws.length - 1] += W - ws.reduce((a, b) => a + b, 0);
  const cell = (t, i, isHead) => new TableCell({
    borders, width: { size: ws[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    shading: isHead ? { fill: "E7E9F5", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER, children: [run(String(t), { size: 20, bold: isHead })] })],
  });
  return [
    numbered ? new Paragraph({ style: "TabCaption", alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 200, after: 100 }, children: [new TextRun(`Table ${++nTab} ${caption}`)] }) : new Paragraph({ children: [] }),
    new Table({
      width: { size: W, type: WidthType.DXA }, columnWidths: ws,
      rows: [new TableRow({ tableHeader: true, children: head.map((t, i) => cell(t, i, true)) }), ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, i, false)) }))],
    }),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  ];
}
const code = (lines) => lines.map((l) => new Paragraph({ spacing: { line: 240, after: 0 }, children: [new TextRun({ text: l || " ", font: "Consolas", size: 17 })] }));
let nFig = 0, nTab = 0;
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

/* ---------------- numbers from the runs ---------------- */
const fav = metrics.demand_favorita, m5 = metrics.demand_m5, br = metrics.branch, tfi = metrics.site.tfi_restaurants, rx = metrics.retailx;
const S = f2d.summary;
const byKey = Object.fromEntries(S.map((s) => [s.key, s]));
const best = S.reduce((a, b) => (b.cost < a.cost ? b : a));
const sameN = f2d.perSeries.mostAccurateIsCheapest, ofN = f2d.perSeries.of;
const regret = f2d.perSeries.avgExtraCostOfPickingMostAccurate;
const rho = f2d.spearmanWapeVsCost;

/* ================= FRONT MATTER ================= */
const title = [
  new Paragraph({ spacing: { before: 600, after: 480 }, alignment: AlignmentType.CENTER, children: [run("RETAILX: AN INTEGRATED ERP AND FORECAST-TO-DECISION PLATFORM FOR SMALL AND MEDIUM RETAIL ENTERPRISES", { bold: true, size: 32 })] }),
  center("A CAPSTONE PROJECT REPORT", { bold: true }, 360),
  center("Submitted in partial fulfillment of the", { italics: true }, 0),
  center("requirement for the award of the", { italics: true }, 0),
  center("Degree of", { italics: true }, 360),
  center("BACHELOR OF TECHNOLOGY", { bold: true }, 0),
  center("IN", { bold: true }, 0),
  center("COMPUTER SCIENCE & ENGINEERING", { bold: true }, 360),
  center("by", { italics: true }, 240),
  ...["KASIBHATLA VENU BHARGAVA JISHITH (23BCB7175)", "MODUGANURU MUKESH KUMAR (23BCB7107)", "VEEREPALLI ROHITH (23BCB7281)", "MANNEPALLI KIRAN KUMAR (23BCB7287)"].map((n) => center(n, { bold: true, size: 28 }, 40)),
  center("", {}, 240),
  center("Under the Guidance of", { italics: true }, 80),
  center("MANNEPULI SRUJANA", { bold: true }, 480),
  logo("vitap-logo.png", 3.4, {}, 360),
  center("SCHOOL OF COMPUTER SCIENCE AND ENGINEERING", {}, 0),
  center("VIT-AP UNIVERSITY, AMARAVATI- 522237", {}, 360),
  center("NOVEMBER 2026", {}, 0),
];

const certificate = [
  logo("vitap-seal.png", 1.1, { pageBreakBefore: true }, 120),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [run("CERTIFICATE", { bold: true, size: 28 })] }),
  Plain("This is to certify that the Capstone Project work titled “**RETAILX: AN INTEGRATED ERP AND FORECAST-TO-DECISION PLATFORM FOR SMALL AND MEDIUM RETAIL ENTERPRISES**” that is being submitted by **KASIBHATLA VENU BHARGAVA JISHITH (23BCB7175), MODUGANURU MUKESH KUMAR (23BCB7107), VEEREPALLI ROHITH (23BCB7281), and MANNEPALLI KIRAN KUMAR (23BCB7287)** is in partial fulfillment of the requirements for the award of Bachelor of Technology, is a record of bonafide work done under my guidance. The contents of this Project work, in full or in parts, have neither been taken from any other source nor have been submitted to any other Institute or University for award of any degree or diploma and the same is certified."),
  new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 720, after: 0 }, children: [run("Mannepuli Srujana", { bold: true })] }),
  new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [run("Assistant Professor, SCOPE")] }),
  new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 480 }, children: [run("Guide")] }),
  center("The thesis is satisfactory / unsatisfactory", { bold: true }, 720),
  new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: W }], spacing: { after: 480 }, children: [run("Examiner 1", { bold: true }), run("\tExaminer 2", { bold: true })] }),
  center("Approved by", { bold: true }, 720),
  center("Dr. Anil Vitthalrao Turukmane", { bold: true }, 0),
  center("HoD, Department of Networking and Security", {}, 0),
  center("School of Computer Science and Engineering", {}, 0),
  center("VIT-AP University, Amaravati, Andhra Pradesh", {}, 0),
];

const ack = [
  front("ACKNOWLEDGEMENT"),
  Plain("We would like to express our sincere gratitude to VIT-AP University, Amaravati, Andhra Pradesh, for providing us with the opportunity, infrastructure, and academic environment to undertake and successfully complete our Capstone Project."),
  Plain("We are deeply grateful to Dr. G. Viswanathan, Chancellor, VIT-AP University, and Dr. P. Arulmozhivarman, Vice-Chancellor, VIT-AP University, for their visionary leadership, encouragement, and commitment to providing quality education and fostering innovation and research."),
  Plain("We express our sincere thanks to Dr. S. Sudhakar Ilango, Dean, SCOPE, Dr. Saroj Kumar Panigrahy, Associate Dean, SCOPE, and Dr. Anil Vitthalrao Turukmane, HoD, Department of Networking and Security, for their continuous encouragement, academic support, and facilities provided throughout the project."),
  Plain("We are grateful to Mannepuli Srujana, Assistant Professor, SCOPE, our project guide, for the guidance, feedback and encouragement given to us at every review. The decision to judge forecasting models by the stock decisions they lead to, and not only by their error, came out of these discussions."),
  Plain("We would also like to extend our sincere appreciation to all the faculty members and staff of the School of Computer Science and Engineering for their cooperation, valuable suggestions, and support during the course of this project. We also thank the people behind the public datasets and open-source tools this work depends on: the Favorita, M5, Rossmann and TFI datasets on Kaggle, and the Next.js, React, LightGBM and scikit-learn projects."),
  Plain("Finally, we express our heartfelt gratitude to our parents, family members, and friends for their constant encouragement, patience, and support throughout our academic journey."),
  Plain("Project Team Members:", { p: { spacing: { before: 240, after: 80 } } }),
  ...["Kasibhatla Venu Bhargava Jishith – 23BCB7175", "Moduganuru Mukesh Kumar – 23BCB7107", "Veerepalli Rohith – 23BCB7281", "Mannepalli Kiran Kumar – 23BCB7287"].map((s) => new Paragraph({ indent: { left: 720 }, spacing: { after: 40 }, children: [run(s)] })),
];

const abstract = [
  front("ABSTRACT"),
  P("Small and medium retailers in India keep their books in a patchwork of billing apps, spreadsheets and notebooks. The software they can afford records transactions well but says little about what to do next: how much of each product to order, which customer to chase for money, or when cash will run short. Research on demand forecasting, meanwhile, usually ranks models by forecast error alone, although a shop owner gains nothing from a lower error unless it leads to fewer empty shelves or less money tied up in stock."),
  P("This project builds RetailX, a web-based enterprise resource planning (ERP) platform for such businesses, and uses it to study whether the most accurate forecasting model also gives the best inventory decisions. RetailX covers sales and billing (a keyboard-first counter with barcode scanning, returns, UPI and credit), inventory, purchases, expenses, payroll, GST reports with GSTR-1, GSTR-9 and e-way bill files, and double-entry books (profit and loss, balance sheet, bank reconciliation and a Tally export). The counter also applies coupons, combo and near-expiry offers, wholesale prices and cashier limits, and two optional features, product certificates and nutrition labels, can be switched on at set-up. On top of the books it adds forecasting with ten statistical models compared by rolling-origin back-testing, stock and cash planning, an Insights page (dues ageing, idle and expiring stock, supplier scorecard), a restock autopilot with spending limits, and role-based AI assistants. The counter keeps working when the internet drops and sends queued bills exactly once when it returns."),
  P(`We evaluated the system at three levels. On public retail data, gradient-boosted models (LightGBM) reduced error against simple baselines on all four tasks, for example from ${pct(fav.wape_baseline_lag28)} to ${pct(fav.wape)} WAPE on Favorita store demand. In a forecast-to-decision experiment on ${f2d.setup.series} Favorita store-product series, we replayed ${f2d.setup.evalDays} days of weekly ordering with each of RetailX's ten models and its automatic selector. Across models, accuracy and inventory cost were related (Spearman ρ = ${rho.toFixed(2)}), but for individual series the most accurate model was also the cheapest in only ${sameN} of ${ofN} cases, and choosing by accuracy alone cost ${pct(regret)} more on average than the best choice. Simple models such as seasonal naive cost almost nothing to compute and were within ${pct(byKey.snaive.cost / best.cost - 1, 0)} of the best cost, which matters for businesses running on a single shop computer. Functional correctness was checked by sixteen self-checking logic modules and an end-to-end browser test suite of ${24} scenarios, all passing.`),
  P("The results support judging forecasts by the decisions they produce. RetailX therefore shows each reorder suggestion together with the reasoning behind it and lets the owner simulate supplier delays and demand changes before committing."),
  new Paragraph({ spacing: { before: 200 }, children: [run("Keywords: ", { bold: true }), run("SME retail, ERP, demand forecasting, inventory decisions, forecast-to-decision, explainability, offline-first point of sale, GST.", { italics: true })] }),
];

const tocs = [
  front("TABLE OF CONTENTS"),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  front("LIST OF TABLES"),
  new TableOfContents("List of Tables", { hyperlink: true, stylesWithLevels: [new StyleLevel("Table Caption", 1)] }),
  front("LIST OF FIGURES"),
  new TableOfContents("List of Figures", { hyperlink: true, stylesWithLevels: [new StyleLevel("Figure Caption", 1)] }),
  front("LIST OF ABBREVIATIONS"),
  ...table("Abbreviations used in this report", ["Abbreviation", "Meaning"], [
    ["ERP", "Enterprise Resource Planning"], ["SME / MSME", "Small and Medium Enterprise / Micro, Small and Medium Enterprise"],
    ["POS", "Point of Sale (the billing counter)"], ["GST, CGST, SGST, IGST", "Goods and Services Tax; Central, State and Integrated GST"],
    ["HSN", "Harmonised System of Nomenclature (product tax code)"], ["GSTR-1", "Monthly return of outward supplies under GST"],
    ["UPI", "Unified Payments Interface"], ["KPI", "Key Performance Indicator"],
    ["WAPE", "Weighted Absolute Percentage Error"], ["MAE, RMSE", "Mean Absolute Error, Root Mean Squared Error"],
    ["MASE", "Mean Absolute Scaled Error"], ["RMSPE", "Root Mean Squared Percentage Error"],
    ["PF, ESI", "Provident Fund, Employees' State Insurance"], ["PWA", "Progressive Web App"],
  ], [1, 3], false),
];

/* ================= CHAPTER 1 ================= */
const ch1 = [
  ...chapter(1, "INTRODUCTION"),
  P("Micro, small and medium enterprises form a large part of India's economy, and retail shops are among the most common of them. A typical kirana store, pharmacy or apparel shop sells a few hundred to a few thousand products, extends credit to regular customers, buys from a handful of distributors and closes the cash drawer every night. Its owner makes many small decisions every day: what to reorder, how much, which dues to chase, whether to stock up before a festival. Most of these decisions are made from memory and habit."),
  P("Software for this segment has improved. Billing apps produce GST invoices and keep a customer ledger; larger ERP suites add purchasing, accounting and payroll. What remains rare is the step from records to decisions. A shop owner can see last month's sales but is not told that a product will run out three days before the next delivery, or that a regular customer has not visited for six weeks. Studies of ERP adoption in SMEs also point to cost, complexity and the lack of in-house expertise as the main barriers [1]. A useful system for a small shop therefore has to be inexpensive to run, simple to set up and helpful without configuration."),
  P("There is a second, more research-oriented gap. Forecasting research has made steady progress, with large competitions such as M4 and M5 comparing dozens of methods on thousands of series [2], [3]. These comparisons rank methods by forecast accuracy. A retailer, however, does not use a forecast directly. The forecast feeds an ordering rule, and what the business experiences is the outcome of that rule: stock-outs, lost sales and money tied up on shelves. Several authors have argued that the most accurate model is not necessarily the one that gives the best inventory performance [4], [5]. For SMEs, where computing resources and expertise are limited, the question has a practical edge. If a simple model leads to nearly the same decisions as a complex one, the simple model is the better choice."),
  P("RetailX was built to address both gaps. It is a complete web-based ERP for small retailers, and it treats forecasting as a means to a decision. Every reorder suggestion is shown with the numbers behind it, the owner can test what happens if a supplier is late or demand rises, and an optional autopilot places routine orders within limits the owner sets. We used the system's own forecasting engine to run a forecast-to-decision experiment on public data, which forms the research contribution of this report."),
  H2("1.1 Objectives"),
  Plain("The objectives of this project are:"),
  bullet("To design and build a web-based ERP for small and medium retailers that covers sales and billing, inventory, purchases, expenses, payroll and GST reporting, and that can be set up by an owner without technical help."),
  bullet("To build a forecasting engine that compares statistical models by rolling-origin back-testing and uses the result for stock and cash planning."),
  bullet("To benchmark machine learning models (LightGBM) against simple baselines on public retail datasets for store-level demand, branch sales and new-site revenue."),
  bullet("To test whether the most accurate forecasting model also gives the lowest inventory cost, by simulating weekly ordering with each model on real store-product series."),
  bullet("To make decision support explainable and controllable: plain-language reasons for every reorder, a what-if simulator, and an autopilot that acts only within owner-set guardrails."),
  bullet("To keep the system usable in conditions common in Indian retail: unreliable internet at the counter, several languages, credit sales, and accountants who need read-only access."),
  H2("1.2 Background and Literature Survey"),
  P("The literature relevant to this project falls into four groups: ERP adoption in small businesses, retail demand forecasting, the link between forecasts and inventory decisions, and the explainability of model outputs. We review the works that shaped RetailX in that order and summarise them in Table 1."),
  H3("A. ERP in small and medium enterprises"),
  P("**ERP implementation at SMEs: analysis of five Canadian cases (2009)**, by Snider, da Silveira and Balakrishnan [1], studied the critical success factors of ERP projects in five manufacturing and distribution SMEs. Interviews across several roles in each firm showed that limited staff, limited budgets and a lack of internal expertise shaped every stage of the project. We took two design rules from this work. First, set-up has to be guided: RetailX asks the owner about the business and builds the modules, KPIs and roles from the answers. Second, the system must work with no paid services at all, so every optional integration (e-mail, WhatsApp, the AI assistant) has a working fallback."),
  H3("B. Retail demand forecasting"),
  P("**Forecasting: Principles and Practice (2021)**, by Hyndman and Athanasopoulos [6], is the standard reference for the statistical models RetailX uses: naive and seasonal naive forecasts, drift, moving averages, simple and damped-trend exponential smoothing, Holt-Winters seasonal models and regression with seasonal terms. It also describes rolling-origin evaluation, in which a model is repeatedly fitted on data up to a point and scored on the periods that follow. Tashman [7] showed why this matters: a single train-test split gives unstable rankings, while rolling origins average over many forecast situations. RetailX's back-test follows this procedure."),
  P("**Another look at measures of forecast accuracy (2006)**, by Hyndman and Koehler [8], compared error measures and recommended the mean absolute scaled error (MASE), which divides a model's error by that of a naive forecast. A MASE above one means the model is worse than simply repeating the last value. RetailX reports MASE for every model and warns the owner when the chosen model does no better than naive."),
  P("**The M4 Competition (2020)** and **the M5 accuracy competition (2022)**, by Makridakis, Spiliotis and Assimakopoulos [2], [3], compared methods on 100,000 series and on Walmart store-item sales respectively. Combinations and simple statistical methods did well in M4; in M5, gradient-boosted trees such as LightGBM [9] were among the strongest approaches for hierarchical retail data with prices and events. We used the M5 data and LightGBM in our own benchmark."),
  P("**Retail forecasting: Research and practice (2022)**, by Fildes, Ma and Kolassa [10], reviewed forecasting problems at every level of retail, from store location to daily product demand. They found that models with causal variables such as promotions beat simple benchmarks, but that evidence on machine learning was still limited at the time. They also noted that product-level forecasts serve operational store decisions, which is the level RetailX works at."),
  H3("C. From forecasts to inventory decisions"),
  P("**Inventory and Production Management in Supply Chains (2017)**, by Silver, Pyke and Thomas [11], gives the inventory policies RetailX implements. In a periodic-review, order-up-to policy, stock is reviewed at fixed intervals and an order brings the inventory position up to a target equal to expected demand over the lead time plus review period, plus safety stock. Safety stock is the service-level z-value multiplied by the forecast error over that horizon. The book also discusses lost sales versus backorders; for a walk-in shop, lost sales is the realistic assumption."),
  P("**Optimising forecasting models for inventory planning (2020)**, by Kourentzes, Trapero and Barrow [5], is the work closest to our research question. The authors tuned forecasting models directly on inventory measures under a given policy, rather than on error measures, and found on real data that a lower forecast error does not reliably lead to better inventory performance. Our experiment takes the same view but asks a simpler, SME-oriented question: among the models a small business can run on one computer, how often is the most accurate one also the cheapest to run the shop with?"),
  P("**The accuracy of intermittent demand estimates (2005)**, by Syntetos and Boylan [12], showed that standard methods are biased for products that sell only occasionally, which is common for slow movers in small shops. We restricted our experiment to series with regular demand and flagged slow movers separately in RetailX's Insights page, where idle stock is reported in money terms rather than forecast."),
  H3("D. Explainable and trustworthy decision support"),
  P("**A unified approach to interpreting model predictions (2017)**, by Lundberg and Lee [13], introduced SHAP values, which attribute a model's output to its inputs. For the transparent models in RetailX's engine we found a simpler explanation was possible: a reorder quantity is the sum of expected demand and safety stock minus stock on hand, so each suggestion can be explained in one sentence using those three numbers. We reserve attribution methods such as SHAP for future work with the LightGBM models."),
  P("**Forecasting: theory and practice (2022)**, by Petropoulos and co-authors [14], is a broad review that stresses judgemental adjustment: people who use forecasts change them when they know something the model does not. This supported two RetailX features: a festival calendar the owner can edit, from which the uplift on past festival days is learned, and a what-if simulator in which the owner moves supplier delay and demand sliders before deciding."),
  ...table("Summary of the literature survey", ["Work", "Contribution", "Use in RetailX"], [
    ["Snider et al. (2009) [1]", "Success factors of ERP in SMEs", "Guided set-up; no paid service required"],
    ["Hyndman & Athanasopoulos (2021) [6]", "Statistical forecasting methods", "Ten models in the forecast engine"],
    ["Tashman (2000) [7]", "Rolling-origin evaluation", "Back-test used to select models"],
    ["Hyndman & Koehler (2006) [8]", "MASE error measure", "Warning when a model is worse than naive"],
    ["Makridakis et al. (2020, 2022) [2], [3]", "M4 and M5 competitions", "M5 data and LightGBM benchmark"],
    ["Fildes et al. (2022) [10]", "Review of retail forecasting", "Store-product level focus"],
    ["Silver et al. (2017) [11]", "Inventory policies, safety stock", "Order-up-to policy, service level"],
    ["Kourentzes et al. (2020) [5]", "Accuracy is not inventory performance", "Forecast-to-decision experiment"],
    ["Syntetos & Boylan (2005) [12]", "Intermittent demand bias", "Slow movers handled as idle stock"],
    ["Lundberg & Lee (2017) [13]", "SHAP explanations", "Future work; one-line reasons today"],
    ["Petropoulos et al. (2022) [14]", "Judgement in forecasting", "Editable festival calendar, what-if"],
  ], [2.2, 2.4, 2.4]),
  H3("Research gap"),
  P("Two gaps stand out. On the systems side, affordable retail software records transactions but rarely turns them into explained, actionable suggestions, and research prototypes rarely include the full set of business functions a shop needs every day. On the methods side, model comparisons are almost always made on forecast error, while studies that link forecasts to inventory outcomes tend to use specialised optimisation that a small business cannot run. RetailX addresses the first gap by building the complete system, and our experiment addresses the second by measuring, with the same lightweight engine a shop would run, how far accuracy rankings and decision rankings agree."),
  H2("1.3 Organization of the Report"),
  Plain("The remaining chapters of the report are organised as follows:"),
  bullet("Chapter 2 describes the proposed system, its working methodology, the standards it follows, and its software and hardware."),
  bullet("Chapter 3 gives the cost of building and running the system."),
  bullet("Chapter 4 presents the results: the machine learning benchmark, the forecast-to-decision experiment, functional testing and the application screens."),
  bullet("Chapter 5 concludes the report and outlines future work."),
  bullet("Chapter 6 (Appendix) lists the key code."),
  bullet("Chapter 7 lists the references."),
];

/* ================= CHAPTER 2 ================= */
const ch2 = [
  ...chapter(2, "RETAILX: SYSTEM DESIGN AND IMPLEMENTATION"),
  P("This chapter describes the proposed system, its working methodology, the standards used, and the software and hardware details."),
  H2("2.1 Proposed System"),
  P("RetailX is a multi-tenant web application. Each business has its own workspace of modules (record types such as Sales, Stock or Purchases), KPIs, team roles, automations and AI assistants. The system is organised in five layers, shown in Figure 1."),
  ...figure("architecture.png", "System architecture of RetailX", 6),
  bullet("**Presentation layer.** Pages built with Next.js and React: the public website, sign-up and onboarding, the dashboard, the billing counter, record screens for each module, Insights, Forecasting, Analytics, Reports, the AI team, Automations, Approvals and Settings."),
  bullet("**Application layer.** Server actions that validate every input, check the user's role, write to the database and record an audit entry. Sessions are handled by Auth.js."),
  bullet("**Intelligence layer.** The forecasting engine, stock and cash planning, the Insights calculations, the what-if simulator and the restock autopilot. All of it is written as pure TypeScript functions that run on the server and in the browser and are tested by self-checks."),
  bullet("**Automation and AI layer.** Rules that fire when a record is saved, on a schedule or when a KPI crosses a threshold; AI roles (CFO, COO, GM and others) that use the business's own numbers; and outgoing messages by WhatsApp, e-mail or web push. A scheduler endpoint runs these tasks daily."),
  bullet("**Data layer.** A libSQL database (SQLite on a single machine, or Turso when hosted) with nine tables. The offline Python pipeline, used for benchmarking, sits beside it."),
  H2("2.2 Working Methodology"),
  P("Figure 2 shows how a transaction becomes a decision in RetailX. A sale recorded at the counter updates the sales records and stock on hand. KPIs and reports are computed from the records on demand. The forecasting engine projects demand, the planning functions turn the projection into order quantities, and the owner (or the autopilot) acts. The outcome of that action is recorded in turn and feeds the next forecast."),
  ...figure("dataflow.png", "From a recorded transaction to a decision", 6.2),
  H3("2.2.1 Onboarding and workspace generation"),
  P("A new owner answers a short questionnaire: industry (14 are available) and category, whether the business keeps stock, sells on credit or pays salaries, how many locations it has, and its goals for the year. From these answers RetailX selects modules from 20 templates, picks KPIs from a library of 54, sets up team roles and starter automations, and adds category-specific fields such as expiry date and batch for pharmacies and groceries, or size and colour for apparel. Everything generated can later be changed in Settings."),
  H3("2.2.2 Billing counter and offline operation"),
  P("The counter is designed for speed. A USB barcode scanner, the device camera or the keyboard adds items; typing “3*milk” adds three. Several bills can be held in tabs. Payment can be cash (with change calculated), UPI (a QR code for the exact amount is shown), card or credit. A bill is stored as one sales record per line sharing an invoice number, so GST, KPIs and forecasts see every line. Stock is reduced in the same database transaction. Loyalty points, earned at one point per ₹100 spent, can be redeemed as a discount, and a per-customer credit limit is enforced on the server."),
  P("Internet connections at small shops are often unreliable, so the counter is built to keep working offline. A service worker keeps the last copy of the counter page and its scripts, so the page loads even with no connection. When a bill cannot be sent, it is stored on the device with a unique identifier and sent automatically when the connection returns. The server records each identifier it has processed, so a bill that was half-sent before the connection dropped is never saved twice."),
  H3("2.2.3 Forecasting engine"),
  P("The engine implements ten models: naive, seasonal naive, drift, long-run mean, moving average, simple exponential smoothing, damped-trend Holt, Holt-Winters additive and multiplicative, and a least-squares regression with trend and seasonal terms. Smoothing parameters are chosen by grid search on one-step-ahead error. Seasonality is detected from the autocorrelation at the candidate season length. Each model is scored by a rolling-origin back-test over four folds, reporting MAE, RMSE, sMAPE, MASE and bias, and the automatic mode picks the model with the lowest error on the measure the owner chooses. Prediction intervals come from the residual standard deviation scaled by each model's error growth over the horizon."),
  H3("2.2.4 Stock planning, explanations and the what-if simulator"),
  P("For each product, the planner takes the last eight weeks of daily sales, forecasts demand over the lead time plus review period with a weekly pattern, and sets safety stock as z·σ·√L, where z is the service-level factor, σ the residual standard deviation and L the lead time in days. The order quantity is expected demand plus safety stock minus stock on hand. Each line comes with a one-sentence explanation built from these numbers, for example: “Sells about 3.0 a day; expected demand until the next delivery is 30, plus 8 spare for busy days. 6 on hand lasts about 2.0 days, shorter than the 3-day wait for stock. Order 32.”"),
  P("The what-if simulator applies the same calculation with two extra controls: a supplier delay in days and a demand change in percent. It lists the products that would run out before stock arrives, and by how many units, so the owner can see the cost of a late supplier or a festival rush before deciding."),
  H3("2.2.5 Insights"),
  P("The Insights page reads the existing books and reports what needs attention:"),
  bullet("**Customer dues** grouped by phone number and aged into 0–30, 31–60 and over 60 days, with a one-tap WhatsApp reminder."),
  bullet("**Idle stock**: products in stock with no sale in 60 days, valued at cost, with a suggestion to discount, bundle or return them."),
  bullet("**Expiring stock**: units that will still be on the shelf at the expiry date at the current selling rate."),
  bullet("**Supplier scorecard**: share of spend, orders past their expected date, and the largest unit-price rise per item."),
  bullet("**Customers**: the best customers by spend and regulars who have not bought for 45 days or more."),
  bullet("**Counter exceptions**: staff whose return rate is well above the shop's average, or whose cash drawer was short at three or more day-closes. These are flagged as prompts to look, never as verdicts."),
  P("The same watch-list opens the daily briefing of the CFO, COO and GM assistants, so the owner sees it without opening the page."),
  H3("2.2.6 Restock autopilot with guardrails"),
  P("An owner who trusts the planner can let it place routine orders. The autopilot runs once a day. It takes the products marked “order now” and creates purchase orders only from suppliers the owner has ticked, only while the week's total stays under a spending cap, and never for an item that already has an open order. Items without a unit cost are skipped rather than guessed. Orders are only promises to buy; the autopilot never makes a payment. Every order is written to the audit log under the name “Autopilot” and the owner receives a notification."),
  H3("2.2.7 GST, payroll and other business functions"),
  P("Amounts are recorded GST-inclusive. The tax is split into CGST and SGST for sales within the state, or IGST when the buyer's GSTIN has a different state code. Reports give a GSTR-3B style summary, an HSN summary and input tax credit, and a GSTR-1 file in the offline tool's JSON layout. Payroll works out provident fund at 12% of wages up to the ₹15,000 ceiling and ESI at 0.75% when gross pay is ₹21,000 or less, and creates the month's pay entries once. Quotations can be sent on WhatsApp and billed at the counter in one step. A bank statement in CSV form can be imported as categorised expenses."),
  H3("2.2.8 Roles, security and the AI team"),
  P("Each person signs in with an e-mail, phone or username tied to one business and one role. A role lists the modules and areas it can open, and a role can be marked view-only, which is how an accountant or auditor is given access: they can read everything assigned to them, and every save is refused on the server. Passwords are hashed with scrypt and a random salt. Sign-in attempts are rate-limited, and password-reset responses never reveal whether an account exists."),
  P("AI roles use Anthropic's Claude model when an API key is configured. Each role has a mandate, a set of KPIs and an autonomy level (advise, draft or act), and its tools read the books, create tasks and propose automations. Without an API key, each role still produces a rule-based briefing from the KPIs. The assistants never invent figures: every number they state comes from a tool call on the business's own records."),
  H3("2.2.9 Database design"),
  P("Figure 3 shows the database. The business configuration (modules, KPIs, roles, automations and settings) is kept as one JSON document per business, because it is read and written as a whole. Transaction records are stored one per row with the module name and a JSON data column, so a business can add custom fields without a schema change. Deleted records are kept for 30 days in a recycle bin."),
  ...figure("er.png", "Database design (entity-relationship diagram)", 6),
  H3("2.2.10 Counter extensions, books and optional features"),
  P("Several functions of a mature billing product were added to the counter and the back office. Part of this code was ported from a single-shop point-of-sale system the team had built earlier, and re-written so that it works on RetailX's records and business types. Each function is a pure TypeScript module with its own self-check, and the server repeats every check the browser makes, so a modified client cannot bypass it."),
  bullet("**Offers.** Coupons (percentage or flat, with a minimum bill and dates), combos (a set of items for one price, applied biggest saving first with each unit counted once) and near-expiry offers on a single batch. The counter shows each saving as it applies and the server prices the bill again. Insights suggests the discount that clears a batch before it expires, which grows as expiry nears but never prices the item below its cost plus 5%; batches that cannot be cleared at a profit are flagged for return to the supplier, and expired batches are refused at billing."),
  bullet("**Pricing and stock rules.** A wholesale price applies from a minimum quantity, and a returning customer's last rate is offered again. Batches of one product share a barcode, and a scan picks the batch that expires first and still has stock. A return made against an invoice cannot exceed what was sold on it, and goods sent back to a supplier are recorded as a debit note. Stock can be transferred between branches and warehouses, and serial or IMEI numbers are kept per unit."),
  bullet("**Controls.** Each role can be given a maximum discount and may or may not sell below the list price. When a cashier's bill goes beyond a limit, the owner can approve it by typing a PIN at the counter; the PIN is stored as a salted scrypt hash, wrong attempts are rate-limited, and the audit entry records the override."),
  bullet("**Credit, tax and staff.** A customer can have payment terms in days, so a credit bill gets a due date and Insights shows what is overdue. Tax collected at source (TCS) can be added to a bill at a rate set in Settings and is summarised by quarter and buyer in the layout of Form 27EQ. The system reports sales per person who billed, with an incentive at a set percentage, and commission on customers a referrer brought."),
  bullet("**Books.** Every sale, purchase, expense, pay run, payment, journal entry, fixed asset and day-close difference is turned into double-entry postings. The trial balance therefore balances by construction, and the profit and loss account, balance sheet and a ledger for each account are read from the same postings. Payments handle cheques (not deposited, deposited, cleared or bounced) and TDS, and settle customer dues; fixed assets are depreciated by the straight-line method month by month. A bank statement in CSV form is matched to the books' bank entries by amount (within ₹1) and date (within three days), and what is left on either side is listed. The books can be exported to Tally as import XML, and a Tally masters file can be imported into Customers and Stock. A “Verify my data” check lists problems such as negative stock, duplicate invoice numbers, missing prices or GST rates and malformed GSTINs, with a link to fix each."),
  bullet("**Government files and scanning.** An e-way bill file for any invoice, in the layout of the portal's bulk upload, and a GSTR-9 annual summary month by month. A photograph of a supplier's bill is read in the browser by the Tesseract OCR engine; a rule-based parser extracts the supplier's GSTIN, bill number, date and item lines, matches them to the stock list, and shows every line for review before anything is saved. Because OCR and parsing are heuristic, nothing is added without the owner's check."),
  bullet("**Optional features.** Product certificates (a link to a lab report, FSSAI or ISI certificate, who issued it and until when) and nutrition labels (ingredients, nutrition per serving, a veg or non-veg mark, allergens, how to use, FSSAI number) are off by default. The owner switches them on during set-up or later in Settings; switching one on adds its fields to Stock, and switching it off hides the fields while keeping what was entered. Pack labels print these fields with a QR code to the certificate, and Insights lists certificates that run out within 30 days."),
  H2("2.3 Standards"),
  P("The standards and specifications followed in this project are:"),
  bullet("**GST invoicing (CGST Act, 2017).** Tax invoices carry the supplier's and, for B2B sales, the buyer's GSTIN, the HSN code and the tax split. The GSTR-1 export follows the JSON layout of the GST offline tool."),
  bullet("**UPI deep links (NPCI).** Payment requests use the upi://pay URI format with payee address, name, amount and note, which any UPI app opens."),
  bullet("**Code 128 barcodes (ISO/IEC 15417).** Shelf labels are printed in Code 128-B, which standard USB scanners read."),
  bullet("**Transport Layer Security (TLS).** In deployment all traffic is served over HTTPS; session cookies are HTTP-only."),
  bullet("**scrypt password hashing (RFC 7914).** Passwords are stored as a salted scrypt hash and compared in constant time."),
  bullet("**Web Push (RFC 8030) with VAPID (RFC 8292).** Notifications to phones and browsers use the open web push protocol."),
  bullet("**Web Content Accessibility Guidelines (WCAG) 2.1.** Text meets a 4.5:1 contrast ratio, every control is reachable by keyboard and focus is always visible."),
  H2("2.4 System Details"),
  P("This section describes the software and hardware used to build and run the system."),
  H3("2.4.1 Software Details"),
  ...table("Main software and libraries", ["Component", "Technology", "Purpose"], [
    ["Web framework", "Next.js 16 (App Router), React 19", "Pages, server rendering, server actions"],
    ["Language", "TypeScript 5", "All application and model code"],
    ["Styling", "Tailwind CSS 4", "Layout, light and dark themes"],
    ["Authentication", "Auth.js (NextAuth v5)", "Sessions, credentials sign-in"],
    ["Database", "libSQL (SQLite / Turso)", "Business, records, audit, outbox"],
    ["AI assistants", "Anthropic Claude via official SDK", "AI roles, with rule-based fallback"],
    ["Notifications", "web-push, Resend, WhatsApp Cloud API", "Push, e-mail and WhatsApp messages"],
    ["ML benchmark", "Python, pandas, LightGBM, scikit-learn", "Models on public retail datasets"],
    ["Testing", "Playwright, Node self-checks", "End-to-end and unit-level checks"],
  ], [1.4, 2.2, 2.4]),
  P(`The application consists of about 13,400 lines of TypeScript in 106 files. The forecasting engine and all planning code are written without external libraries so that they run in the browser and on a low-cost server alike.`),
  H3("2.4.2 Hardware Details"),
  P("RetailX is a web application and needs no special hardware. Development and testing used an ordinary laptop. At a shop, the following devices are used, all optional except the first:"),
  bullet("**A computer, tablet or Android phone with a modern browser** to run the counter and the back office. The counter remains usable without internet once it has been opened online."),
  bullet("**A USB barcode scanner** that types the code followed by Enter, as most scanners do. The device camera can be used instead."),
  bullet("**An 80 mm thermal receipt printer or any A4 printer.** Receipts and invoices are printed from the browser."),
  bullet("**A server** to host the application. For a single shop this can be the same computer; for several shops a free or low-cost cloud host and database are enough."),
];

/* ================= CHAPTER 3 ================= */
const ch3 = [
  ...chapter(3, "COST ANALYSIS"),
  H2("3.1 List of components and their cost"),
  P("RetailX is built entirely on open-source software, so there is no licence cost. Table 3 gives the cost of running it for one shop. Hosting and database costs are for the free tiers of the providers named; hardware prices are approximate retail prices in India and should be confirmed at the time of purchase."),
  ...table("List of components and their cost (indicative)", ["Component", "Cost"], [
    ["Software (Next.js, React, libSQL, LightGBM and others)", "₹ 0 (open source)"],
    ["Application hosting (free tier of a cloud host)", "₹ 0 per month"],
    ["Hosted database (free tier of Turso)", "₹ 0 per month"],
    ["Domain name (optional)", "about ₹ 800 per year"],
    ["AI assistant API usage (optional; rule-based fallback is free)", "pay per use"],
    ["USB barcode scanner (optional)", "about ₹ 1,500"],
    ["80 mm thermal receipt printer (optional)", "about ₹ 3,500"],
    ["Counter computer or Android phone (usually already owned)", "existing device"],
    ["TOTAL for a shop that already owns a computer", "about ₹ 5,800 one-time + ₹ 800 per year"],
  ], [3, 1.6]),
  P("For comparison, commercial billing and inventory software for small businesses is usually sold by annual subscription. RetailX's running cost is limited to optional services, which matters for the businesses the literature identifies as most sensitive to ERP cost [1]."),
];

/* ================= CHAPTER 4 ================= */
const f2dRows = S.map((s) => [s.name.replace(" (best back-test MAE, as in RetailX)", " (RetailX auto)"), pct(s.wape), pct(s.fill), s.coverDays.toFixed(2), s.cost.toFixed(3), s.msPerFit.toFixed(2)]);
const ch4 = [
  ...chapter(4, "RESULTS AND DISCUSSION"),
  P("We evaluated RetailX in four ways: machine learning benchmarks on public retail data, a forecast-to-decision experiment, a check of the store-level models on the demonstration store, and functional testing of the application. The numbers in this chapter come from the result files produced by the code (ml/models/metrics.json and ml/models/f2d.json) and from the test runs."),
  H2("4.1 Machine learning benchmark on public retail data"),
  P("We trained LightGBM models on four public datasets and compared each against a simple baseline that a shop could compute by hand. Demand models use only information known 16 days ahead (sales lagged by 16 days or more, calendar features and, for M5, prices and events), so their evaluation reflects a real ordering situation. Each model was scored on a final holdout period that it did not see during training."),
  ...table("LightGBM against simple baselines on public datasets", ["Task (dataset)", "Size", "Metric", "Baseline", "LightGBM"], [
    ["Store-family daily demand (Favorita)", `${fav.series.toLocaleString("en-IN")} series`, "WAPE, 16 days", pct(fav.wape_baseline_lag28), pct(fav.wape)],
    ["Item-store daily demand (M5, FOODS_3)", `${m5.series.toLocaleString("en-IN")} series`, "WAPE, 16 days", pct(m5.wape_baseline_lag28), pct(m5.wape)],
    ["Branch daily sales (Rossmann)", `${br.stores.toLocaleString("en-IN")} stores`, "RMSPE, 42 days", pct(br.rmspe_baseline_store_dow_median), pct(br.rmspe)],
    ["New-site revenue (TFI)", `${tfi.rows} sites`, "RMSE (log), CV", tfi.cv_rmse_log_baseline_mean.toFixed(3), tfi.cv_rmse_log.toFixed(3)],
  ], [2.4, 1.2, 1.3, 0.9, 0.9]),
  ...figure("benchmark.png", "Error of LightGBM and simple baselines (lower is better)", 5.6),
  P(`The baselines were the same weekday four weeks earlier for demand, the store's median sales for that weekday for Rossmann, and the overall mean for TFI. LightGBM reduced error on every task. The gain was largest for branch sales, where RMSPE fell from ${pct(br.rmspe_baseline_store_dow_median)} to ${pct(br.rmspe)}, and smallest for new-site revenue, where only ${tfi.rows} restaurants were available and the improvement over the mean was modest. Item-level demand in M5 remained hard (WAPE ${pct(m5.wape)}), because many items sell zero or one unit on most days, which matches the difficulty of intermittent demand reported in the literature [12].`),
  P(`We also tested an anomaly detector for branch data: we injected ${br.anomaly.injected} artificial disruptions into the Rossmann holdout and flagged days whose robust z-score across sales, customers and average bill exceeded ${br.anomaly.z_threshold}. It found ${pct(br.anomaly.recall, 0)} of the injected disruptions with ${pct(br.anomaly.precision, 0)} precision, at ${br.anomaly.false_alarms_per_store_month.toFixed(2)} false alarms per store per month. That alarm rate is low enough for an owner to look at every flag.`),
  H2("4.2 Models on the demonstration store"),
  P(`For the illustrative single store used in the demonstration workspace, a damped-trend Holt model forecast monthly revenue with a MAPE of ${rx.revenue_forecast.mape}% over six rolling folds on twelve months of data. Twelve months is too short to learn a yearly festival pattern, which is why RetailX lets the owner add festivals and learns their uplift from history instead. Same-weekday anomaly checks on six daily store metrics flagged ${rx.anomalies.flagged_days} days, all ${rx.anomalies.caught} of which matched incidents logged in the store's day book, with no false flags. For product demand over a seven-day back-test, a weekday-average method reached a WAPE of ${rx.product_demand.wapePct}% against ${rx.product_demand.baselinePct}% for repeating the same weekday of the previous week. This is a small gain, and it shows that for a stable shop a simple seasonal rule is already close to the best available.`),
  H2("4.3 Forecast-to-decision experiment"),
  H3("4.3.1 Setup"),
  P(`The research question is whether the most accurate forecasting model also gives the best stock decisions. We took the Favorita store-sales data and selected stores 1 to 10 and six high-volume product families (grocery, beverages, produce, cleaning, dairy, and bread and bakery), giving ${ofN} daily series. For each series we replayed the last ${f2d.setup.evalDays} days. Once a week, each model saw only the ${f2d.setup.trainDays} days before that day, forecast the next ${f2d.setup.leadDays + f2d.setup.reviewDays} days (a ${f2d.setup.leadDays}-day lead time plus a ${f2d.setup.reviewDays}-day review period), and an order-up-to policy ordered that forecast plus safety stock at a ${pct(f2d.setup.service, 0)} service level, minus stock on hand and on order. Demand that met an empty shelf was lost. Inventory cost was 1 per unit held per day plus ${f2d.setup.costLostPerUnit} per unit of lost sale (a 90% critical ratio, typical of groceries where a lost sale costs far more than holding a unit for a day). Cost and stock were divided by each series' average daily demand so that large and small stores can be added together. We ran all ten models in RetailX's engine and its automatic selector, which picks a model at each review by back-test MAE.`),
  H3("4.3.2 Results"),
  ...table("Forecast accuracy and inventory outcome by model (60 series, 84 days)", ["Model", "WAPE", "Fill rate", "Stock held (days)", "Cost / day", "ms per fit"], f2dRows, [2.6, 0.9, 0.9, 1.1, 0.9, 0.9]),
  ...figure("f2d_scatter.png", "Forecast error against inventory cost for each model", 5.8),
  P(`Across the eleven approaches, accuracy and cost moved together: the Spearman rank correlation between WAPE and cost was ${rho.toFixed(2)}. The most accurate model on average, trend plus seasonal regression (WAPE ${pct(byKey.regression.wape)}), also had the lowest average cost. At the level of the whole portfolio, therefore, choosing by accuracy was a reasonable rule.`),
  P(`The picture changed at the level of individual series, which is where an owner actually makes decisions. For each series we compared the model with the lowest WAPE against the model with the lowest cost. They were the same model in only ${sameN} of ${ofN} series (${pct(sameN / ofN, 0)}). In the other ${ofN - sameN} series a less accurate model led to cheaper stock decisions, and on average across all series, choosing the most accurate model cost ${pct(regret)} more than the best choice would have.`),
  ...figure("f2d_fill.png", "Fill rate against average stock held for each model", 5.6),
  P(`Figure 6 shows why. Accuracy measures penalise over- and under-forecasting equally, but an inventory policy does not. Naive and drift forecasts had the worst WAPE (${pct(byKey.naive.wape)} and ${pct(byKey.drift.wape)}) yet cost less than the long-run mean and exponential smoothing, which were more accurate. The mean and smoothing models give flat forecasts with wide residuals, so they held more stock (${byKey.mean.coverDays.toFixed(2)} and ${byKey.ses.coverDays.toFixed(2)} days) to reach almost perfect fill rates, and paid for it in holding cost. The naive models held less and accepted a few more lost sales. Which trade-off is cheaper depends on the cost ratio, not on the error measure.`),
  P(`Computation cost also differed by an order of magnitude or more. Seasonal naive needed ${byKey.snaive.msPerFit.toFixed(3)} ms per fit and was within ${pct(byKey.snaive.cost / best.cost - 1, 0)} of the best cost. RetailX's automatic selector, which back-tests all ten models at every review, needed ${byKey.auto.msPerFit.toFixed(1)} ms and came within ${pct(byKey.auto.cost / best.cost - 1, 1)} of the best. On a shop computer with a few hundred products, both are fast enough. At the scale of a distributor with tens of thousands of products, the difference would matter, and a simple seasonal model would be the sensible default.`),
  H3("4.3.3 Discussion"),
  P("The experiment supports the view that forecasts should be judged by the decisions they produce [5]. For an SME the practical lessons are:"),
  bullet("Choosing a model by accuracy is a sound default for a whole shop, but it is often wrong for a particular product. Showing the stock and cost consequences of a forecast is more useful to an owner than showing its error."),
  bullet("The cost ratio between holding and losing a sale decides which errors are expensive. A pharmacy with expensive, expiring stock and a grocery with cheap, fast-moving stock should not use the same rule."),
  bullet("Simple seasonal models are nearly as good as the best model for regular, high-volume products and cost almost nothing to run."),
  P("These findings guided three design choices in RetailX: every reorder line shows its demand, safety stock and stock cover; the what-if simulator lets the owner see the consequence of different assumptions; and the autopilot uses the same transparent policy, limited by a spending cap the owner sets."),
  P("The experiment has limits. It uses one retailer's data, regular high-volume series only, one inventory policy and one cost ratio, and it does not optimise the safety stock separately for each model. Testing more cost ratios, intermittent items and models tuned directly on inventory cost, as Kourentzes et al. did [5], is left for future work."),
  H2("4.4 Functional testing"),
  P(`Correctness was checked at two levels. Sixteen logic modules (metrics, forecasting, GST, planning, importers, sample data, branch evaluation, benchmarks, the counter, Insights, payroll, the autopilot, offers, the books, the supplier-bill parser and the customer and accounting extras) each contain a self-check that runs on known inputs with known answers, for example that a ₹118 sale at 18% GST splits into ₹100 taxable value and ₹18 tax, that the autopilot never orders from a supplier not on the owner's list, that the trial balance of a mixed set of sales, purchases, cheques, payroll and depreciation balances to the paisa, or that a near-expiry offer never prices an item below cost plus 5%. All sixteen pass. An end-to-end suite of 24 browser scenarios, written with Playwright, runs against a fresh database each time and covers the full journey of a business. All 24 pass. Table 6 lists the scenarios.`),
  ...table("End-to-end test scenarios (all passing)", ["#", "Scenario"], [
    ["1–2", "Sign-up; onboarding builds a grocery workspace with sample data"],
    ["3", "A sale is added, deleted and restored"],
    ["4", "The counter bills scanned items, reduces stock, takes a return and closes the day"],
    ["5", "Offline: the counter reloads with no connection, queues a bill and sends it once"],
    ["6", "A credit bill over the customer's credit limit is refused"],
    ["7", "Loyalty points are earned and redeemed once"],
    ["8", "A quotation is billed at the counter and marked Accepted"],
    ["9", "A bank statement is imported as categorised expenses"],
    ["10", "Analytics, forecasts, stock and cash plans render from the data"],
    ["11", "The autopilot orders urgent lines and never orders the same item twice"],
    ["12", "Insights sections render; the what-if result changes with the supplier delay"],
    ["13", "A payroll run computes PF and ESI and is created only once"],
    ["14–16", "Market comparison; AI role reply without an API key; invoice and other pages open"],
    ["17", "A staff member signs in with a username and sees only their role's pages"],
    ["18", "A view-only accountant can read the books but every save is refused"],
    ["19–21", "No owner takeover by a manager; no account enumeration on reset; scheduler needs its secret"],
    ["22", "Offers: a coupon comes off a counter bill and an unknown code is refused"],
    ["23", "A supplier return is a debit note; the trial balance balances; the books export to Tally"],
    ["24", "Payment terms, TCS, Form 27EQ, staff report, Verify my data, Tally import and pack labels"],
  ], [0.6, 5]),
  H2("4.5 Application screens"),
  P("Figures 7 to 19 show the main screens of RetailX in the demonstration workspace of a grocery store, created through the normal sign-up and onboarding flow with sample data."),
  ...figure("onboarding.png", "Onboarding: choosing the industry and category", 6),
  ...figure("dashboard.png", "Owner dashboard with KPI tiles", 6),
  ...figure("pos.png", "Billing counter with barcode, voice and camera input", 6),
  ...figure("insights.png", "Insights: customer dues with ageing and reminders", 6),
  ...figure("whatif.png", "What-if simulator with supplier delay and demand change", 6),
  ...figure("stock.png", "Stock planning with order suggestions and autopilot", 6),
  ...figure("forecasting.png", "Forecasting: model comparison by back-test", 6),
  ...figure("cash.png", "13-week cash-flow forecast", 6),
  ...figure("reports.png", "GST reports with GSTR-3B summary and GSTR-1 export", 6),
  ...figure("ai.png", "AI team with role-based assistants", 6),
  ...figure("offers.png", "Insights: near-expiry offer that clears a batch above cost plus 5%", 6),
  ...figure("books.png", "Books: profit and loss posted from the records", 6),
  ...figure("counter_settings.png", "Settings: invoice layout, TCS, staff incentive, owner PIN and optional features", 6),
  H2("4.6 Limitations"),
  bullet("The forecast-to-decision experiment uses one dataset, one policy and one cost ratio (Section 4.3.3)."),
  bullet("The LightGBM models are benchmarked offline; the application itself uses the lighter statistical engine, which runs in the browser."),
  bullet("Payroll does not yet cover professional tax, TDS or attendance-based deductions, and the GSTR-1 file nets returns into their tax slab instead of the credit-note tables. Both should be checked by an accountant before filing."),
  bullet("A product at another branch or warehouse is a separate stock row, and a batch is a stock row with its own expiry; there is no single view of one product across all locations."),
  bullet("The books assume amounts are GST-inclusive and value stock at cost from purchases and sale lines. Cash, bank or stock from before the first record shows as a negative balance until an opening-balance journal entry is added."),
  bullet("Supplier-bill scanning depends on photo quality and bill layout, which is why every line is reviewed; the e-way bill and GSTR-9 files follow the portals' published formats but have not been tested on the live portals."),
  bullet("The system has been tested with sample data and in automated tests, not yet in a live shop over a full season."),
];

/* ================= CHAPTER 5 ================= */
const ch5 = [
  ...chapter(5, "CONCLUSION AND FUTURE WORK"),
  P("RetailX shows that a small retailer can have more than a billing and record-keeping system at very low running cost. The platform covers the daily work of a shop (billing with GST, offers, credit and loyalty, stock, purchases, expenses, payroll, double-entry books and reports) and adds decision support on top of the same records: forecasts compared by back-testing, order suggestions with their reasons, a what-if simulator, an Insights page that turns the books into a short list of actions, and an autopilot that orders within limits the owner sets. It keeps working when the counter loses its internet connection, and it gives accountants read-only access."),
  P(`The forecast-to-decision experiment gave a clear answer to our research question. Across models, accuracy and inventory cost were strongly related (ρ = ${rho.toFixed(2)}), so accuracy is a sensible way to pick a default. For individual products, however, the most accurate model was the cheapest in only ${pct(sameN / ofN, 0)} of cases, and the trade-off between stock held and sales lost, which an error measure does not see, decided the outcome. Simple seasonal models came close to the best result at a small fraction of the computation. For SME software, this argues for showing owners the decision consequences of a forecast, not just its error, and for preferring simple, explainable models unless a more complex one clearly pays for itself.`),
  P("Future work falls into three areas:"),
  bullet("**Research.** Repeat the experiment across cost ratios, intermittent products and other datasets; tune models directly on inventory cost; and add SHAP-based explanations for the LightGBM models."),
  bullet("**Product.** E-invoicing and direct filing through the government portals, an online store and courier tracking, marketplace order sync, and statutory payroll deductions."),
  bullet("**Field study.** Deploy RetailX in a small number of shops for a full festival season and measure changes in stock-outs, idle stock and collection of dues."),
];

/* ================= CHAPTER 6: APPENDIX ================= */
const read = (p, from, to) => fs.readFileSync(path.join("d:/Coding/Projects/RetailX", p), "utf8").split("\n").slice(from - 1, to);
const findLines = (p, startPat, count) => { const L = fs.readFileSync(path.join("d:/Coding/Projects/RetailX", p), "utf8").split("\n"); const i = L.findIndex((l) => l.includes(startPat)); return L.slice(i, i + count); };
const ch6 = [
  ...chapter(6, "APPENDIX"),
  P("This appendix lists the code at the centre of the decision-support features."),
  H2("A. Stock planning (src/lib/planning.ts)"),
  ...code(findLines("src/lib/planning.ts", "export function stockPlan", 28)),
  H2("B. Restock autopilot with guardrails (src/lib/autoorder.ts)"),
  ...code(findLines("src/lib/autoorder.ts", "export function autoOrders", 30)),
  H2("C. Forecast-to-decision simulation (ml/f2d.ts)"),
  ...code(findLines("ml/f2d.ts", "function simulate", 52)),
  H2("D. Explanation of a reorder line (src/lib/insights.ts)"),
  ...code(findLines("src/lib/insights.ts", "export function explainLine", 6)),
];

/* ================= REFERENCES ================= */
const refs = [
  "B. Snider, G. J. C. da Silveira and J. Balakrishnan, “ERP implementation at SMEs: analysis of five Canadian cases,” International Journal of Operations & Production Management, vol. 29, no. 1, pp. 4–29, 2009.",
  "S. Makridakis, E. Spiliotis and V. Assimakopoulos, “The M4 Competition: 100,000 time series and 61 forecasting methods,” International Journal of Forecasting, vol. 36, no. 1, pp. 54–74, 2020.",
  "S. Makridakis, E. Spiliotis and V. Assimakopoulos, “M5 accuracy competition: Results, findings, and conclusions,” International Journal of Forecasting, vol. 38, no. 4, pp. 1346–1364, 2022.",
  "A. A. Syntetos, J. E. Boylan and S. M. Disney, “Forecasting for inventory planning: a 50-year review,” Journal of the Operational Research Society, vol. 60, suppl. 1, pp. S149–S160, 2009.",
  "N. Kourentzes, J. R. Trapero and D. K. Barrow, “Optimising forecasting models for inventory planning,” International Journal of Production Economics, vol. 225, article 107597, 2020.",
  "R. J. Hyndman and G. Athanasopoulos, Forecasting: Principles and Practice, 3rd ed. Melbourne, Australia: OTexts, 2021.",
  "L. J. Tashman, “Out-of-sample tests of forecasting accuracy: an analysis and review,” International Journal of Forecasting, vol. 16, no. 4, pp. 437–450, 2000.",
  "R. J. Hyndman and A. B. Koehler, “Another look at measures of forecast accuracy,” International Journal of Forecasting, vol. 22, no. 4, pp. 679–688, 2006.",
  "G. Ke, Q. Meng, T. Finley, T. Wang, W. Chen, W. Ma, Q. Ye and T.-Y. Liu, “LightGBM: A highly efficient gradient boosting decision tree,” in Advances in Neural Information Processing Systems 30, 2017.",
  "R. Fildes, S. Ma and S. Kolassa, “Retail forecasting: Research and practice,” International Journal of Forecasting, vol. 38, no. 4, pp. 1283–1318, 2022.",
  "E. A. Silver, D. F. Pyke and D. J. Thomas, Inventory and Production Management in Supply Chains, 4th ed. Boca Raton, FL, USA: CRC Press, 2017.",
  "A. A. Syntetos and J. E. Boylan, “The accuracy of intermittent demand estimates,” International Journal of Forecasting, vol. 21, no. 2, pp. 303–314, 2005.",
  "S. M. Lundberg and S.-I. Lee, “A unified approach to interpreting model predictions,” in Advances in Neural Information Processing Systems 30, 2017.",
  "F. Petropoulos et al., “Forecasting: theory and practice,” International Journal of Forecasting, vol. 38, no. 3, pp. 705–871, 2022.",
  "Corporación Favorita, “Store Sales – Time Series Forecasting,” Kaggle. [Online]. Available: https://www.kaggle.com/competitions/store-sales-time-series-forecasting",
  "University of Nicosia, “M5 Forecasting – Accuracy,” Kaggle. [Online]. Available: https://www.kaggle.com/competitions/m5-forecasting-accuracy",
  "Rossmann, “Rossmann Store Sales,” Kaggle. [Online]. Available: https://www.kaggle.com/competitions/rossmann-store-sales",
  "TAB Food Investments, “Restaurant Revenue Prediction,” Kaggle. [Online]. Available: https://www.kaggle.com/competitions/restaurant-revenue-prediction",
  "C. Percival and S. Josefsson, “The scrypt Password-Based Key Derivation Function,” RFC 7914, IETF, 2016.",
  "M. Thomson, E. Damaggio and B. Raymor, “Generic Event Delivery Using HTTP Push,” RFC 8030, IETF, 2016.",
  "World Wide Web Consortium, “Web Content Accessibility Guidelines (WCAG) 2.1,” W3C Recommendation, 2018.",
];
const references = [
  front("REFERENCES"),
  ...refs.map((r, i) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: 300, after: 120 }, indent: { left: 567, hanging: 567 }, children: [run(`[${i + 1}]\t${r}`, { size: 22 })], tabStops: [{ type: TabStopType.LEFT, position: 567 }] })),
];

const TEAM = [["Kasibhatla Venu Bhargava Jishith", "23BCB7175"], ["Moduganuru Mukesh Kumar", "23BCB7107"], ["Veerepalli Rohith", "23BCB7281"], ["Mannepalli Kiran Kumar", "23BCB7287"]];
const biodata = TEAM.flatMap(([name, reg], i) => [
  i === 0 ? front("BIODATA") : new Paragraph({ spacing: { before: 480 }, children: [] }),
  new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [2200, W - 2200],
    rows: [new TableRow({ children: [
      new TableCell({ borders, width: { size: 2200, type: WidthType.DXA }, children: [new Paragraph({ spacing: { before: 900, after: 900 }, alignment: AlignmentType.CENTER, children: [run("Photo", { color: "888888" })] })] }),
      new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: border, right: { style: BorderStyle.NONE } }, width: { size: W - 2200, type: WidthType.DXA }, margins: { left: 300 },
        children: [["Name", name], ["Registration Number", reg], ["Mobile Number", ""], ["E-mail", ""], ["Permanent Address", ""]].map(([k, v]) => new Paragraph({ spacing: { after: 80 }, children: [run(`${k}\t: `, { size: 22 }), v ? run(v, { size: 22 }) : run(`<${k.toLowerCase()}>`, { size: 22, color: "888888" })], tabStops: [{ type: TabStopType.LEFT, position: 2200 }] })) }),
    ] })],
  }),
]);

/* ================= ASSEMBLE ================= */
const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 22 })] })] });
const page = { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1800, right: 1440 } };
const doc = new Document({
  features: { updateFields: true },
  creator: "RetailX team", title: "RetailX capstone report",
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 30, bold: true }, paragraph: { spacing: { before: 120, after: 360 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 26, bold: true }, paragraph: { spacing: { before: 300, after: 160 }, keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 24, bold: true }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 2 } },
      { id: "FigCaption", name: "Figure Caption", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 20, bold: true } },
      { id: "TabCaption", name: "Table Caption", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 20, bold: true } },
    ],
  },
  numbering: { config: [
    { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ] },
  sections: [
    { properties: { page }, children: title },
    { properties: { page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } } }, footers: { default: footer }, children: [...certificate, ...ack, ...abstract, ...tocs] },
    { properties: { page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } }, footers: { default: footer }, children: [...ch1, ...ch2, ...ch3, ...ch4, ...ch5, ...ch6, ...references, ...biodata] },
  ],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(path.join(__dirname, "RetailX_Capstone_Report.docx"), b); console.log("written"); });

import type { Lang } from "@/lib/model";

/**
 * Interface text for the everyday screens (navigation, records, dashboard, tasks). Module, field and KPI names are
 * the business's own words and are shown as written. Missing keys fall back to English.
 */
const en = {
  "nav.dashboard": "Dashboard", "nav.analytics": "Analytics", "nav.forecasting": "Forecasting", "nav.ai": "AI team",
  "nav.approvals": "Approvals", "nav.automations": "Automations", "nav.tasks": "Tasks", "nav.reports": "Reports",
  "nav.settings": "Settings", "nav.planner": "Branch planner", "nav.market": "Market comparison", "nav.quick": "Quick add",
  "nav.pos": "Counter", "nav.dayclose": "Day close", "nav.labels": "Barcode labels", "nav.insights": "Insights",
  "nav.books": "Books",
  "group.overview": "Overview", "group.intelligence": "Intelligence", "group.automation": "Automation", "group.workspace": "Workspace", "group.records": "Records",
  "shell.signout": "Sign out", "shell.notifications": "Notifications", "shell.nothing": "Nothing new.", "shell.markread": "Mark all read",
  "shell.language": "Language", "shell.profile": "Profile & security",
  "rec.add": "Add record", "rec.hide": "Hide form", "rec.import": "Import", "rec.export": "Export", "rec.save": "Save changes",
  "rec.addbtn": "Add", "rec.cancel": "Cancel", "rec.search": "Search", "rec.records": "records", "rec.bin": "Recycle bin",
  "rec.restore": "Restore", "rec.deleted": "Deleted", "rec.undo": "Undo", "rec.views": "Views", "rec.saveview": "Save view",
  "rec.history": "History", "rec.empty": "No records yet", "rec.select": "Select…", "rec.added": "added this visit",
  "dash.morning": "Good morning", "dash.afternoon": "Good afternoon", "dash.evening": "Good evening",
  "dash.sub": "Your dashboard. Every tile reads live from your records.", "dash.customise": "Customise", "dash.savelayout": "Save layout",
  "dash.saveall": "Save for everyone", "dash.reset": "Use business layout", "dash.start": "Start recording",
  "dash.ready": "Your workspace is ready. Add or import your first records and these tiles come alive.",
  "dash.sample": "You're looking at sample data.", "dash.removesample": "Remove sample data",
  "dash.tasks": "Open tasks", "dash.activity": "Activity", "dash.trend": "Trend · finished periods", "dash.forecast": "Forecast",
  "dash.next": "Next period", "dash.vsprior": "vs prior", "dash.vssame": "vs same days", "dash.vstarget": "vs target", "dash.talk": "Talk", "dash.open": "Open",
  "task.todo": "To do", "task.doing": "In progress", "task.done": "Done", "task.new": "Add a task…", "task.everything": "Everything",
  "task.mine": "Mine & unassigned", "task.ai": "AI team",
};
export type Key = keyof typeof en;

const hi: Partial<Record<Key, string>> = {
  "nav.books": "बही-खाते",
  "nav.dashboard": "डैशबोर्ड", "nav.analytics": "विश्लेषण", "nav.forecasting": "पूर्वानुमान", "nav.ai": "एआई टीम", "nav.approvals": "मंज़ूरी",
  "nav.automations": "ऑटोमेशन", "nav.tasks": "काम", "nav.reports": "रिपोर्ट", "nav.settings": "सेटिंग्स", "nav.planner": "शाखा योजना", "nav.market": "बाज़ार से तुलना", "nav.quick": "जल्दी जोड़ें", "nav.insights": "इनसाइट्स",
  "nav.pos": "बिलिंग काउंटर", "nav.dayclose": "दिन का हिसाब", "nav.labels": "बारकोड लेबल",
  "group.overview": "सारांश", "group.intelligence": "जानकारी", "group.automation": "स्वचालन", "group.workspace": "कार्यक्षेत्र", "group.records": "रिकॉर्ड",
  "shell.signout": "साइन आउट", "shell.notifications": "सूचनाएँ", "shell.nothing": "कुछ नया नहीं।", "shell.markread": "सब पढ़ा हुआ", "shell.language": "भाषा", "shell.profile": "प्रोफ़ाइल और सुरक्षा",
  "rec.add": "रिकॉर्ड जोड़ें", "rec.hide": "फ़ॉर्म छिपाएँ", "rec.import": "आयात", "rec.export": "निर्यात", "rec.save": "बदलाव सहेजें", "rec.addbtn": "जोड़ें",
  "rec.cancel": "रद्द करें", "rec.search": "खोजें", "rec.records": "रिकॉर्ड", "rec.bin": "रीसायकल बिन", "rec.restore": "वापस लाएँ", "rec.deleted": "हटाया गया",
  "rec.undo": "पूर्ववत करें", "rec.views": "व्यू", "rec.saveview": "व्यू सहेजें", "rec.history": "इतिहास", "rec.empty": "अभी कोई रिकॉर्ड नहीं", "rec.select": "चुनें…", "rec.added": "इस बार जोड़े गए",
  "dash.morning": "सुप्रभात", "dash.afternoon": "नमस्कार", "dash.evening": "शुभ संध्या", "dash.sub": "आपका डैशबोर्ड। हर टाइल आपके रिकॉर्ड से सीधे पढ़ती है।",
  "dash.customise": "बदलें", "dash.savelayout": "लेआउट सहेजें", "dash.saveall": "सबके लिए सहेजें", "dash.reset": "व्यवसाय लेआउट लें", "dash.start": "रिकॉर्ड करना शुरू करें",
  "dash.ready": "आपका कार्यक्षेत्र तैयार है। पहले रिकॉर्ड जोड़ें या आयात करें।", "dash.sample": "आप नमूना डेटा देख रहे हैं।", "dash.removesample": "नमूना डेटा हटाएँ",
  "dash.tasks": "खुले काम", "dash.activity": "गतिविधि", "dash.trend": "रुझान · पूरी अवधि", "dash.forecast": "पूर्वानुमान", "dash.next": "अगली अवधि",
  "dash.vsprior": "पिछली अवधि से", "dash.vssame": "उन्हीं दिनों से", "dash.vstarget": "लक्ष्य से", "dash.talk": "बात करें", "dash.open": "खोलें",
  "task.todo": "करना है", "task.doing": "चल रहा है", "task.done": "हो गया", "task.new": "नया काम…", "task.everything": "सब", "task.mine": "मेरे और बिना सौंपे", "task.ai": "एआई टीम",
};

const mr: Partial<Record<Key, string>> = {
  "nav.books": "हिशोब वह्या",
  "nav.dashboard": "डॅशबोर्ड", "nav.analytics": "विश्लेषण", "nav.forecasting": "अंदाज", "nav.ai": "एआय टीम", "nav.approvals": "मंजुरी",
  "nav.automations": "ऑटोमेशन", "nav.tasks": "कामे", "nav.reports": "अहवाल", "nav.settings": "सेटिंग्ज", "nav.planner": "शाखा नियोजन", "nav.market": "बाजाराशी तुलना", "nav.quick": "पटकन जोडा", "nav.insights": "अंतर्दृष्टी",
  "nav.pos": "बिलिंग काउंटर", "nav.dayclose": "दिवसाचा हिशोब", "nav.labels": "बारकोड लेबल",
  "group.overview": "आढावा", "group.intelligence": "माहिती", "group.automation": "स्वयंचलन", "group.workspace": "कार्यक्षेत्र", "group.records": "नोंदी",
  "shell.signout": "साइन आउट", "shell.notifications": "सूचना", "shell.nothing": "नवीन काही नाही.", "shell.markread": "सर्व वाचले", "shell.language": "भाषा", "shell.profile": "प्रोफाइल आणि सुरक्षा",
  "rec.add": "नोंद जोडा", "rec.hide": "फॉर्म लपवा", "rec.import": "आयात", "rec.export": "निर्यात", "rec.save": "बदल जतन करा", "rec.addbtn": "जोडा", "rec.cancel": "रद्द करा",
  "rec.search": "शोधा", "rec.records": "नोंदी", "rec.bin": "रिसायकल बिन", "rec.restore": "परत आणा", "rec.deleted": "हटवले", "rec.undo": "पूर्ववत", "rec.views": "व्ह्यू",
  "rec.saveview": "व्ह्यू जतन करा", "rec.history": "इतिहास", "rec.empty": "अजून नोंदी नाहीत", "rec.select": "निवडा…", "rec.added": "या वेळी जोडल्या",
  "dash.morning": "सुप्रभात", "dash.afternoon": "नमस्कार", "dash.evening": "शुभ संध्याकाळ", "dash.sub": "तुमचा डॅशबोर्ड. प्रत्येक टाइल तुमच्या नोंदींमधून थेट वाचते.",
  "dash.customise": "बदला", "dash.savelayout": "मांडणी जतन करा", "dash.saveall": "सर्वांसाठी जतन करा", "dash.reset": "व्यवसायाची मांडणी वापरा", "dash.start": "नोंदी सुरू करा",
  "dash.ready": "तुमचे कार्यक्षेत्र तयार आहे. पहिल्या नोंदी जोडा किंवा आयात करा.", "dash.sample": "तुम्ही नमुना डेटा पाहत आहात.", "dash.removesample": "नमुना डेटा काढा",
  "dash.tasks": "उघडी कामे", "dash.activity": "हालचाल", "dash.trend": "कल · पूर्ण कालावधी", "dash.forecast": "अंदाज", "dash.next": "पुढील कालावधी",
  "dash.vsprior": "मागील कालावधीपेक्षा", "dash.vssame": "त्याच दिवसांपेक्षा", "dash.vstarget": "लक्ष्यापेक्षा", "dash.talk": "बोला", "dash.open": "उघडा",
  "task.todo": "करायचे", "task.doing": "चालू", "task.done": "झाले", "task.new": "नवीन काम…", "task.everything": "सर्व", "task.mine": "माझी आणि न सोपवलेली", "task.ai": "एआय टीम",
};

const ta: Partial<Record<Key, string>> = {
  "nav.books": "கணக்குப் புத்தகங்கள்",
  "nav.dashboard": "டாஷ்போர்டு", "nav.analytics": "பகுப்பாய்வு", "nav.forecasting": "முன்கணிப்பு", "nav.ai": "AI குழு", "nav.approvals": "ஒப்புதல்கள்",
  "nav.automations": "தானியக்கம்", "nav.tasks": "பணிகள்", "nav.reports": "அறிக்கைகள்", "nav.settings": "அமைப்புகள்", "nav.planner": "கிளை திட்டம்", "nav.market": "சந்தை ஒப்பீடு", "nav.quick": "விரைவு சேர்", "nav.insights": "நுண்ணறிவு",
  "nav.pos": "பில்லிங் கவுண்டர்", "nav.dayclose": "நாள் முடிவு", "nav.labels": "பார்கோடு லேபிள்",
  "group.overview": "மேலோட்டம்", "group.intelligence": "நுண்ணறிவு", "group.automation": "தானியக்கம்", "group.workspace": "பணியிடம்", "group.records": "பதிவுகள்",
  "shell.signout": "வெளியேறு", "shell.notifications": "அறிவிப்புகள்", "shell.nothing": "புதிதாக எதுவும் இல்லை.", "shell.markread": "அனைத்தும் படித்தது", "shell.language": "மொழி", "shell.profile": "சுயவிவரம் & பாதுகாப்பு",
  "rec.add": "பதிவு சேர்", "rec.hide": "படிவத்தை மறை", "rec.import": "இறக்குமதி", "rec.export": "ஏற்றுமதி", "rec.save": "மாற்றங்களைச் சேமி", "rec.addbtn": "சேர்",
  "rec.cancel": "ரத்து", "rec.search": "தேடு", "rec.records": "பதிவுகள்", "rec.bin": "மறுசுழற்சி தொட்டி", "rec.restore": "மீட்டெடு", "rec.deleted": "நீக்கப்பட்டது",
  "rec.undo": "செயல்தவிர்", "rec.views": "காட்சிகள்", "rec.saveview": "காட்சியைச் சேமி", "rec.history": "வரலாறு", "rec.empty": "இன்னும் பதிவுகள் இல்லை", "rec.select": "தேர்வு…", "rec.added": "இம்முறை சேர்த்தவை",
  "dash.morning": "காலை வணக்கம்", "dash.afternoon": "மதிய வணக்கம்", "dash.evening": "மாலை வணக்கம்", "dash.sub": "உங்கள் டாஷ்போர்டு. ஒவ்வொரு ஓடும் உங்கள் பதிவுகளிலிருந்து நேரடியாகப் படிக்கிறது.",
  "dash.customise": "மாற்று", "dash.savelayout": "அமைப்பைச் சேமி", "dash.saveall": "அனைவருக்கும் சேமி", "dash.reset": "வணிக அமைப்பைப் பயன்படுத்து", "dash.start": "பதிவைத் தொடங்கு",
  "dash.ready": "உங்கள் பணியிடம் தயார். முதல் பதிவுகளைச் சேர்க்கவும் அல்லது இறக்குமதி செய்யவும்.", "dash.sample": "நீங்கள் மாதிரித் தரவைப் பார்க்கிறீர்கள்.", "dash.removesample": "மாதிரித் தரவை நீக்கு",
  "dash.tasks": "திறந்த பணிகள்", "dash.activity": "செயல்பாடு", "dash.trend": "போக்கு · முடிந்த காலங்கள்", "dash.forecast": "முன்கணிப்பு", "dash.next": "அடுத்த காலம்",
  "dash.vsprior": "முந்தையதுடன்", "dash.vssame": "அதே நாட்களுடன்", "dash.vstarget": "இலக்குடன்", "dash.talk": "பேசு", "dash.open": "திற",
  "task.todo": "செய்ய வேண்டியவை", "task.doing": "நடக்கிறது", "task.done": "முடிந்தது", "task.new": "புதிய பணி…", "task.everything": "அனைத்தும்", "task.mine": "என்னுடையவை", "task.ai": "AI குழு",
};

const te: Partial<Record<Key, string>> = {
  "nav.dashboard": "డాష్‌బోర్డ్", "nav.analytics": "విశ్లేషణ", "nav.forecasting": "అంచనాలు", "nav.ai": "ఏఐ బృందం", "nav.approvals": "ఆమోదాలు",
  "nav.automations": "ఆటోమేషన్", "nav.tasks": "పనులు", "nav.reports": "రిపోర్టులు", "nav.settings": "సెట్టింగ్‌లు", "nav.planner": "శాఖ ప్రణాళిక",
  "nav.market": "మార్కెట్ పోలిక", "nav.quick": "త్వరగా జోడించు", "nav.insights": "సూచనలు", "nav.books": "ఖాతా పుస్తకాలు",
  "nav.pos": "బిల్లింగ్ కౌంటర్", "nav.dayclose": "రోజు ముగింపు", "nav.labels": "బార్‌కోడ్ లేబుల్స్",
  "group.overview": "సారాంశం", "group.intelligence": "సమాచారం", "group.automation": "స్వయంచాలనం", "group.workspace": "కార్యస్థలం", "group.records": "రికార్డులు",
  "shell.signout": "సైన్ అవుట్", "shell.notifications": "నోటిఫికేషన్లు", "shell.nothing": "కొత్తది ఏమీ లేదు.", "shell.markread": "అన్నీ చదివినట్లు", "shell.language": "భాష", "shell.profile": "ప్రొఫైల్ & భద్రత",
  "rec.add": "రికార్డు జోడించు", "rec.hide": "ఫారం దాచు", "rec.import": "దిగుమతి", "rec.export": "ఎగుమతి", "rec.save": "మార్పులు సేవ్ చేయి", "rec.addbtn": "జోడించు",
  "rec.cancel": "రద్దు", "rec.search": "వెతుకు", "rec.records": "రికార్డులు", "rec.bin": "రీసైకిల్ బిన్", "rec.restore": "తిరిగి తెచ్చు", "rec.deleted": "తొలగించబడింది",
  "rec.undo": "రద్దు చేయి", "rec.views": "వ్యూలు", "rec.saveview": "వ్యూ సేవ్ చేయి", "rec.history": "చరిత్ర", "rec.empty": "ఇంకా రికార్డులు లేవు", "rec.select": "ఎంచుకోండి…", "rec.added": "ఈసారి జోడించినవి",
  "dash.morning": "శుభోదయం", "dash.afternoon": "నమస్కారం", "dash.evening": "శుభ సాయంత్రం", "dash.sub": "మీ డాష్‌బోర్డ్. ప్రతి టైల్ మీ రికార్డుల నుండి నేరుగా చదువుతుంది.",
  "dash.customise": "మార్చు", "dash.savelayout": "లేఅవుట్ సేవ్ చేయి", "dash.saveall": "అందరికీ సేవ్ చేయి", "dash.reset": "వ్యాపార లేఅవుట్ వాడు", "dash.start": "రికార్డులు మొదలుపెట్టండి",
  "dash.ready": "మీ కార్యస్థలం సిద్ధంగా ఉంది. మొదటి రికార్డులు జోడించండి లేదా దిగుమతి చేయండి.", "dash.sample": "మీరు నమూనా డేటా చూస్తున్నారు.", "dash.removesample": "నమూనా డేటా తీసివేయి",
  "dash.tasks": "తెరిచిన పనులు", "dash.activity": "కార్యకలాపం", "dash.trend": "ధోరణి · పూర్తయిన కాలాలు", "dash.forecast": "అంచనా", "dash.next": "తదుపరి కాలం",
  "dash.vsprior": "గత కాలంతో", "dash.vssame": "అవే రోజులతో", "dash.vstarget": "లక్ష్యంతో", "dash.talk": "మాట్లాడు", "dash.open": "తెరువు",
  "task.todo": "చేయాలి", "task.doing": "జరుగుతోంది", "task.done": "పూర్తి", "task.new": "కొత్త పని…", "task.everything": "అన్నీ", "task.mine": "నావి & ఎవరికీ ఇవ్వనివి", "task.ai": "ఏఐ బృందం",
};

const DICTS: Record<Lang, Partial<Record<Key, string>>> = { en, hi, mr, ta, te };
export const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" }, { value: "hi", label: "हिन्दी" }, { value: "mr", label: "मराठी" }, { value: "ta", label: "தமிழ்" }, { value: "te", label: "తెలుగు" },
];

export const t = (lang: Lang | undefined, key: Key) => DICTS[lang ?? "en"]?.[key] ?? en[key];

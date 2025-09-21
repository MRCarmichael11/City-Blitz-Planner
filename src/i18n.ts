import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Lang = 'en' | 'ko' | 'zh-CN' | 'th';

type Dict = Record<string, string>;

const dictionaries: Record<Lang, Dict> = {
  en: {
    'strike.title': 'Faction Strike Planner',
    'tabs.active': 'Active',
    'tabs.proposed': 'Proposed',
    'tabs.history': 'History',
    'labels.myFaction': 'My Faction',
    'labels.targeting': 'Targeting',
    'ui.attackerSelect': 'Attacker alliance…',
    'ui.reset': 'Reset current cycle',
    'table.rank': '#',
    'table.target': 'Target',
    'table.interest': 'Interest',
    'table.action': 'Action',
    'bracket.b1': 'Bracket 1 (1–10)',
    'bracket.b2': 'Bracket 2 (11–20)',
    'interest.none': 'None',
    'actions.interested': 'Interested',
    'actions.withdraw': 'Withdraw',
    'tooltips.markInterest': 'Mark interest',
    'tooltips.bracketMismatch': 'Bracket mismatch',
  },
  ko: {
    'strike.title': '진영 공격 플래너',
    'tabs.active': '진행 중',
    'tabs.proposed': '제안됨',
    'tabs.history': '기록',
    'labels.myFaction': '내 진영',
    'labels.targeting': '공격 대상',
    'ui.attackerSelect': '공격 동맹 선택…',
    'ui.reset': '현재 사이클 초기화',
    'table.rank': '#',
    'table.target': '대상',
    'table.interest': '관심',
    'table.action': '작업',
    'bracket.b1': '브래킷 1 (1–10)',
    'bracket.b2': '브래킷 2 (11–20)',
    'interest.none': '없음',
    'actions.interested': '관심표시',
    'actions.withdraw': '철회',
    'tooltips.markInterest': '관심 표시',
    'tooltips.bracketMismatch': '브래킷 불일치',
  },
  'zh-CN': {
    'strike.title': '阵营打击计划',
    'tabs.active': '进行中',
    'tabs.proposed': '已提议',
    'tabs.history': '历史',
    'labels.myFaction': '我的阵营',
    'labels.targeting': '目标阵营',
    'ui.attackerSelect': '选择进攻联盟…',
    'ui.reset': '重置当前周期',
    'table.rank': '#',
    'table.target': '目标',
    'table.interest': '意向',
    'table.action': '操作',
    'bracket.b1': '分档1 (1–10)',
    'bracket.b2': '分档2 (11–20)',
    'interest.none': '无',
    'actions.interested': '有意向',
    'actions.withdraw': '撤回',
    'tooltips.markInterest': '标记意向',
    'tooltips.bracketMismatch': '分档不匹配',
  },
  th: {
    'strike.title': 'ตัววางแผนการโจมตีของฝ่าย',
    'tabs.active': 'กำลังดำเนินการ',
    'tabs.proposed': 'เสนอไว้',
    'tabs.history': 'ประวัติ',
    'labels.myFaction': 'ฝ่ายของฉัน',
    'labels.targeting': 'ฝ่ายเป้าหมาย',
    'ui.attackerSelect': 'เลือกพันธมิตรผู้โจมตี…',
    'ui.reset': 'รีเซ็ตรอบปัจจุบัน',
    'table.rank': '#',
    'table.target': 'เป้าหมาย',
    'table.interest': 'ความสนใจ',
    'table.action': 'การดำเนินการ',
    'bracket.b1': 'ระดับ 1 (1–10)',
    'bracket.b2': 'ระดับ 2 (11–20)',
    'interest.none': 'ไม่มี',
    'actions.interested': 'แสดงความสนใจ',
    'actions.withdraw': 'ถอน',
    'tooltips.markInterest': 'ทำเครื่องหมายความสนใจ',
    'tooltips.bracketMismatch': 'ระดับไม่ตรงกัน',
  },
};

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  langs: Array<{ code: Lang; name: string }>;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: any }) {
  const saved = (typeof window !== 'undefined' ? (localStorage.getItem('lang') as Lang | null) : null) || 'en';
  const [lang, setLangState] = useState<Lang>(saved);
  const setLang = (l: Lang) => { setLangState(l); if (typeof window !== 'undefined') localStorage.setItem('lang', l); };
  const t = (key: string) => (dictionaries[lang] && dictionaries[lang][key]) || (dictionaries['en'][key] || key);
  const langs = useMemo(() => ([
    { code: 'en', name: 'English' },
    { code: 'ko', name: '한국어' },
    { code: 'zh-CN', name: '简体中文' },
    { code: 'th', name: 'ไทย' },
  ]), []);
  const value: Ctx = { lang, setLang, t, langs };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('I18nProvider missing');
  return ctx;
}


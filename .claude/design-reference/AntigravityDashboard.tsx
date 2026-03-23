"use client";

import React, { useState } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

export interface DashboardProps {
  name: string;
  belt: string;
  stripes: number;
  level: number;
  xp: number;
  xpMax: number;
  ovr: number;
  role: string;
  stats: {
    guard: number;
    passing: number;
    control: number;
    finishing: number;
    takedowns: number;
    legLocks: number;
  };
  trainingMonths: number;
  totalSessions: number;
  streakWeeks: number;
  bestStreak: number;
  giRatio: number;
  recentFocus: { tag: string; count: number; category: string }[];
  closestArchetype: { name: string; flag: string; style: string };
}

export default function SenseiDashboard(props: DashboardProps) {
  const [hoveredStripes, setHoveredStripes] = useState<boolean>(false);

  const years = Math.floor(props.trainingMonths / 12);
  const months = props.trainingMonths % 12;
  const trainingTimeStr = `${years > 0 ? `${years}년 ` : ""}${
    months > 0 ? `${months}개월` : ""
  }`;

  const radarData = [
    { subject: "Guard", value: props.stats.guard, fullMark: 100 },
    { subject: "Passing", value: props.stats.passing, fullMark: 100 },
    { subject: "Control", value: props.stats.control, fullMark: 100 },
    { subject: "Finishing", value: props.stats.finishing, fullMark: 100 },
    { subject: "Takedowns", value: props.stats.takedowns, fullMark: 100 },
    { subject: "Leg Locks", value: props.stats.legLocks, fullMark: 100 },
  ];

  const statBars = [
    { name: "Guard", value: props.stats.guard, color: "bg-purple-500" },
    { name: "Passing", value: props.stats.passing, color: "bg-green-500" },
    { name: "Control", value: props.stats.control, color: "bg-orange-600" },
    { name: "Finishing", value: props.stats.finishing, color: "bg-red-500" },
    { name: "Takedowns", value: props.stats.takedowns, color: "bg-blue-400" },
    { name: "Leg Locks", value: props.stats.legLocks, color: "bg-zinc-700" },
  ];

  const belts = [
    { id: "white", color: "bg-zinc-200" },
    { id: "blue", color: "bg-blue-600" },
    { id: "purple", color: "bg-purple-600" },
    { id: "brown", color: "bg-amber-800" },
    { id: "black", color: "bg-zinc-900" },
  ];

  const getClipPath = (index: number, length: number) => {
    if (index === 0)
      return "polygon(0% 0%, calc(100% - 1.5rem) 0%, 100% 50%, calc(100% - 1.5rem) 100%, 0% 100%)";
    if (index === length - 1)
      return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 1.5rem 50%)";
    return "polygon(0% 0%, calc(100% - 1.5rem) 0%, 100% 50%, calc(100% - 1.5rem) 100%, 0% 100%, 1.5rem 50%)";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* 상단 프로필 & 요약 카드 */}
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            
            {/* 좌측 레벨 및 기본 정보 */}
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700">
                <span className="text-2xl font-bold text-white">
                  {props.level}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-xl font-bold">Lv.{props.level}</h1>
                  <span className="px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-semibold uppercase tracking-wider">
                    {props.belt} {Array(props.stripes).fill("I").join("")}
                  </span>
                  <span className="px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-400 text-xs">
                    {props.role}
                  </span>
                </div>
                
                {/* 경험치 바 */}
                <div className="w-full max-w-xs mt-3">
                  <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                    <span>Lv.{props.level} &rarr; Lv.{props.level + 1}</span>
                    <span>
                      {props.xp} / {props.xpMax} XP
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-600 rounded-full"
                      style={{ width: `${(props.xp / props.xpMax) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 우측 수련 기록 요약 */}
            <div className="grid grid-cols-4 gap-6 text-center md:text-left mt-4 md:mt-0">
              <div>
                <p className="text-lg font-bold text-zinc-100">{trainingTimeStr}</p>
                <p className="text-xs text-zinc-500">수련 기간</p>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-100">{props.totalSessions}</p>
                <p className="text-xs text-zinc-500">기록된 수련</p>
              </div>
              <div>
                <p className="text-lg font-bold text-orange-500">{props.streakWeeks}주</p>
                <p className="text-xs text-zinc-500">연속 ({props.bestStreak}주 최장)</p>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-100">{props.giRatio}%</p>
                <p className="text-xs text-zinc-500">Gi 비율</p>
              </div>
            </div>
          </div>

          {/* 벨트 쉐브론 타임라인 */}
          <div className="flex items-center mt-10 h-14 relative w-full gap-0.5">
            {belts.map((belt, idx) => {
              const isActive = props.belt.toLowerCase().includes(belt.id);
              
              return (
                <div
                  key={belt.id}
                  className={`relative h-full flex-1 ${belt.color} ${
                    !isActive && belt.id !== "white" ? "opacity-40 grayscale" : ""
                  }`}
                  style={{ clipPath: getClipPath(idx, belts.length) }}
                >
                  {belt.id === "blue" && isActive && (
                    <div className="absolute right-8 top-0 h-full w-14 bg-zinc-950 flex justify-evenly items-center py-2 px-1">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-1.5 h-full transition-colors duration-200 ${
                            i < props.stripes ? "bg-white" : "bg-zinc-800"
                          }`}
                          onMouseEnter={() => setHoveredStripes(true)}
                          onMouseLeave={() => setHoveredStripes(false)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            
            {hoveredStripes && (
              <div className="absolute top-[-50px] left-[35%] transform -translate-x-1/2 bg-zinc-800 text-xs px-3 py-2 rounded-lg shadow-xl border border-zinc-700 z-10 pointer-events-none">
                <p className="text-zinc-200">현재 등급 달성일</p>
                <p className="font-semibold text-white">2024년 4월 20일</p>
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-zinc-800 rotate-45 border-r border-b border-zinc-700" />
              </div>
            )}
          </div>
        </div>

        {/* 하단 2단 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 좌측: 능력치 레이더 차트 */}
          <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-6 flex flex-col items-center">
            <h3 className="text-sm font-semibold text-zinc-400 w-full mb-4">
              능력치 레이더
            </h3>
            <div className="w-full h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#27272a" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  />
                  <Radar
                    name="Stats"
                    dataKey="value"
                    stroke="#f97316"
                    strokeWidth={2}
                    fill="#f97316"
                    fillOpacity={0.2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              가장 유사한 아키타입: {props.closestArchetype.flag}{" "}
              <span className="text-zinc-300 font-medium">{props.closestArchetype.name}</span> —{" "}
              {props.closestArchetype.style}
            </p>
          </div>

          {/* 우측: 6축 능력치 바 & 최근 포커스 */}
          <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 mb-6">
                6축 능력치
              </h3>
              <div className="space-y-4">
                {statBars.map((stat) => (
                  <div key={stat.name} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">{stat.name}</span>
                      <span className="font-bold text-zinc-200">
                        {stat.value}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${stat.color} rounded-full transition-all duration-500`}
                        style={{ width: `${stat.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 최근 포커스 */}
            <div className="mt-8 pt-6 border-t border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">
                최근 포커스
              </h3>
              <div className="flex flex-wrap gap-2">
                {props.recentFocus.map((focus) => (
                  <span
                    key={focus.tag}
                    className="px-2.5 py-1 bg-orange-900/20 text-orange-500 border border-orange-900/50 rounded text-xs font-medium"
                  >
                    {focus.tag}
                  </span>
                ))}
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}

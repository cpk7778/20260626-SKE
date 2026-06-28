import React from 'react';

// 재생·속도·슬라이더를 포함하는 타임라인 바 — withAllSlot=true이면 슬라이더 0이 "전체" 슬롯
export interface ChartTimelineProps {
  isPlaying: boolean;
  playSpeed: number;
  sliderIdx: number;
  minIdx?: number;
  maxIdx: number;
  startDate: string;
  currentDate: string;
  onPlay: () => void;
  onSpeedChange: (v: number) => void;
  onSlider: (v: number) => void;
  /** true: 슬라이더 0 = 전체, maxIdx = dates.length */
  withAllSlot?: boolean;
}

export const ChartTimeline = React.memo(function ChartTimeline({
  isPlaying, playSpeed, sliderIdx, minIdx = 0, maxIdx, startDate, currentDate,
  onPlay, onSpeedChange, onSlider,
}: ChartTimelineProps) {
  return (
    <div className="draft-timeline">
      <div className="draft-timeline-controls">
        <button type="button" className="draft-timeline-btn draft-timeline-btn--play" onClick={onPlay}
          title={isPlaying ? '일시정지' : '재생'}>{isPlaying ? '⏸' : '▶'}</button>
        <select className="draft-timeline-speed" value={playSpeed}
          onChange={e => onSpeedChange(+e.target.value)}>
          <option value={400}>빠름</option>
          <option value={800}>보통</option>
          <option value={1500}>느림</option>
        </select>
      </div>
      <span className="draft-timeline-date draft-timeline-date--start">{startDate}</span>
      <div className="draft-timeline-track draft-timeline-track--grow">
        <input type="range" min={minIdx} max={maxIdx} value={sliderIdx}
          onChange={e => onSlider(+e.target.value)}
          className="draft-timeline-range" />
      </div>
      <span className="draft-timeline-date draft-timeline-date--end">
        {currentDate || '전체'}
      </span>
    </div>
  );
});

// Scatter 차트 전용 타임라인 — 슬라이더 0=전체(selectedDate=''), dates가 1개 이하면 렌더 생략
export interface ChartScatterTimelineProps {
  dates: string[];
  selectedDate: string;
  isPlaying: boolean;
  playSpeed: number;
  onPlay: () => void;
  onSpeedChange: (v: number) => void;
  onSelectDate: (date: string) => void;
  onStopPlaying: () => void;
}

export const ChartScatterTimeline = React.memo(function ChartScatterTimeline({
  dates, selectedDate, isPlaying, playSpeed, onPlay, onSpeedChange, onSelectDate, onStopPlaying,
}: ChartScatterTimelineProps) {
  if (dates.length <= 1) return null;
  const sliderIdx = selectedDate ? dates.indexOf(selectedDate) + 1 : 0;
  return (
    <ChartTimeline
      isPlaying={isPlaying}
      playSpeed={playSpeed}
      sliderIdx={sliderIdx}
      maxIdx={dates.length}
      startDate={dates[0] ?? ''}
      currentDate={selectedDate}
      withAllSlot
      onPlay={onPlay}
      onSpeedChange={onSpeedChange}
      onSlider={v => {
        onStopPlaying();
        onSelectDate(v === 0 ? '' : dates[v - 1] ?? '');
      }}
    />
  );
});

// 기간 선택 드롭다운 — allLast=true이면 "전체" 옵션을 목록 끝으로 이동
export interface PeriodSelectProps {
  value: number;
  onChange: (v: number) => void;
  allLast?: boolean;
}

export const PeriodSelect = React.memo(function PeriodSelect({ value, onChange, allLast = false }: PeriodSelectProps) {
  return (
    <select className="draft-toolbar-select" value={value}
      onChange={e => onChange(Number(e.target.value))} title="기간 선택">
      {!allLast && <option value={0}>전체</option>}
      <option value={7}>최근 7일</option>
      <option value={14}>최근 14일</option>
      <option value={30}>최근 30일</option>
      {allLast && <option value={0}>전체</option>}
    </select>
  );
});

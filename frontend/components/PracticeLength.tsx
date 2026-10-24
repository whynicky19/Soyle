"use client";

export function PracticeLength({ value, choices, bankSize, unit, onChange }: {
  value: number;
  choices: number[];
  bankSize: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return <fieldset className="practice-length">
    <legend>Длина серии</legend>
    <p>В наборе: {bankSize} {unit}. Сначала показываем разные задания.</p>
    <div>{choices.map(count => <button key={count} type="button" aria-pressed={value === count} onClick={() => onChange(count)}>{count} заданий</button>)}</div>
    {value > bankSize && <small>После всех карточек начнётся повторение с другим расположением вариантов.</small>}
  </fieldset>;
}

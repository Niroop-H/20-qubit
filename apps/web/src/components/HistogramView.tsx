import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

interface HistogramViewProps {
  probabilities: Record<string, number>;
  idealProbabilities: Record<string, number>;
  counts: Record<string, number>;
  shots: number;
}

export const HistogramView: React.FC<HistogramViewProps> = ({
  probabilities,
  idealProbabilities,
  counts,
  shots,
}) => {
  // Limit rendered bars: 20 qubits can yield thousands of observed labels.
  const allKeys = Object.keys(probabilities);
  const visibleKeys = allKeys
    .sort((a, b) =>
      Math.max(probabilities[b], idealProbabilities[b] ?? 0) -
      Math.max(probabilities[a], idealProbabilities[a] ?? 0)
    )
    .slice(0, 32)
    .sort();
  const data = visibleKeys.map((state) => ({
      state: `|${state}⟩`,
      probability: probabilities[state],
      ideal: idealProbabilities[state] ?? 0,
      count: counts[state] || 0,
    }));

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-600 text-xs">
        No measurement data
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
    {allKeys.length > data.length && (
      <p className="text-[10px] text-neutral-400 px-2 pb-1">
        Showing the 32 most significant outcomes of {allKeys.length.toLocaleString()}; exports retain all sampled outcomes.
      </p>
    )}
    <div className="flex-1 min-h-0">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis
          dataKey="state"
          stroke="#525252"
          tick={{ fill: "#a3a3a3", fontSize: 11, fontFamily: "monospace" }}
          interval={data.length > 16 ? "preserveStartEnd" : 0}
          angle={data.length > 8 ? -45 : 0}
          textAnchor={data.length > 8 ? "end" : "middle"}
          height={data.length > 8 ? 50 : 30}
        />
        <YAxis
          stroke="#525252"
          tick={{ fill: "#a3a3a3", fontSize: 10 }}
          domain={[0, "auto"]}
        />
        <Legend
          formatter={(name: string) =>
            name === "probability" ? "Observed frequency" : name
          }
          wrapperStyle={{ fontSize: 10 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#161616",
            borderColor: "#333",
            borderRadius: "6px",
            color: "#fff",
            fontSize: "12px",
          }}
          formatter={(value: number, name: string) => {
            if (name === "probability" || name === "Ideal probability")
              return [
                `${value * 100 < 0.01 ? (value * 100).toExponential(2) : (value * 100).toFixed(2)}%`,
                name === "probability"
                  ? "Observed frequency"
                  : "Ideal probability",
              ];
            return [value, "Shot Count"];
          }}
        />
        <Bar
          isAnimationActive={false}
          dataKey="ideal"
          name="Ideal probability"
          fill="#4f868c"
          radius={[3, 3, 0, 0]}
          maxBarSize={40}
        />
        <Bar
          isAnimationActive={false}
          dataKey="probability"
          fill="#c7a66b"
          radius={[3, 3, 0, 0]}
          maxBarSize={60}
        />
      </BarChart>
    </ResponsiveContainer>
    </div>
    </div>
  );
};

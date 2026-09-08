export function getTemperatureTextColor(temp: number): string {
  if (temp >= 40) return "text-red-700";
  if (temp >= 35) return "text-red-500";
  if (temp >= 30) return "text-orange-400";
  if (temp >= 25) return "text-yellow-400";
  if (temp >= 20) return "text-green-500";
  if (temp >= 15) return "text-green-400";
  if (temp >= 10) return "text-cyan-300";
  if (temp >= 5) return "text-blue-400";
  if (temp >= 0) return "text-blue-500";
  if (temp >= -5) return "text-blue-700";
  return "text-indigo-800";
}

export function getTemperatureColorBorder(temp: number): string {
  if (temp >= 40) return "border-red-700";
  if (temp >= 35) return "border-red-500";
  if (temp >= 30) return "border-orange-400";
  if (temp >= 25) return "border-yellow-400";
  if (temp >= 20) return "border-green-500";
  if (temp >= 15) return "border-green-400";
  if (temp >= 10) return "border-cyan-300";
  if (temp >= 5) return "border-blue-400";
  if (temp >= 0) return "border-blue-500";
  if (temp >= -5) return "border-blue-700";
  return "border-indigo-800";
}

export function getTemperatureLineColor(temp: number): string {
  if (temp >= 40) return "#7f1d1d"; // deep red
  if (temp >= 35) return "#b91c1c"; // red
  if (temp >= 30) return "#ea580c"; // orange
  if (temp >= 25) return "#facc15"; // yellow
  if (temp >= 20) return "#16a34a"; // green
  if (temp >= 15) return "#22c55e"; // light green
  if (temp >= 10) return "#06b6d4"; // cyan
  if (temp >= 5) return "#3b82f6"; // blue
  if (temp >= 0) return "#2563eb"; // deeper blue
  if (temp >= -5) return "#1e3a8a"; // navy
  return "#312e81"; // indigo
}

export function getPressureTextColor(p: number): string {
  if (p >= 1080) return "text-[#301818]";
  if (p >= 1046) return "text-[#6f1840]";
  if (p >= 1038) return "text-[#8e2f39]";
  if (p >= 1030) return "text-[#9f292c]";
  if (p >= 1024) return "text-[#a33e1f]";
  if (p >= 1019) return "text-[#a78345]";
  if (p >= 1015) return "text-[#afb48e]";
  if (p >= 1013) return "text-[#b6b6b6]";
  if (p >= 1011) return "text-[#9bd7c5]";
  if (p >= 1007) return "text-[#68a2d8]";
  if (p >= 1002) return "text-[#2e8e92]";
  if (p >= 995) return "text-[#0e6d8a]";
  if (p >= 986) return "text-[#0c5a94]";
  if (p >= 976) return "text-[#003498]";
  return "text-[#001f60]";
}

export function getPressureBorderColor(p: number): string {
  if (p >= 1080) return "border-[#301818]";
  if (p >= 1046) return "border-[#6f1840]";
  if (p >= 1038) return "border-[#8e2f39]";
  if (p >= 1030) return "border-[#9f292c]";
  if (p >= 1024) return "border-[#a33e1f]";
  if (p >= 1019) return "border-[#a78345]";
  if (p >= 1015) return "border-[#afb48e]";
  if (p >= 1013) return "border-[#b6b6b6]";
  if (p >= 1011) return "border-[#9bd7c5]";
  if (p >= 1007) return "border-[#68a2d8]";
  if (p >= 1002) return "border-[#2e8e92]";
  if (p >= 995) return "border-[#0e6d8a]";
  if (p >= 986) return "border-[#0c5a94]";
  if (p >= 976) return "border-[#003498]";
  return "border-[#001f60]";
}

export function getPressureLineColor(p: number): string {
  if (p >= 1080) return "rgb(48,8,24)";
  if (p >= 1046) return "rgb(111,24,64)";
  if (p >= 1038) return "rgb(142,47,57)";
  if (p >= 1030) return "rgb(159,81,44)";
  if (p >= 1024) return "rgb(163,116,67)";
  if (p >= 1019) return "rgb(167,147,107)";
  if (p >= 1015) return "rgb(176,174,152)";
  if (p >= 1013) return "rgb(182,182,182)";
  if (p >= 1011) return "rgb(155,183,172)";
  if (p >= 1007) return "rgb(103,162,155)";
  if (p >= 1002) return "rgb(26,140,147)";
  if (p >= 995) return "rgb(0,117,146)";
  if (p >= 986) return "rgb(0,90,148)";
  if (p >= 976) return "rgb(0,52,146)";
  return "rgb(0,32,96)";
}

export function getHumidityTextColor(h: number): string {
  if (h >= 100) return "text-[#2e3a69]";
  if (h >= 90) return "text-[#3c74a6]";
  if (h >= 80) return "text-[#1794b1]";
  if (h >= 70) return "text-[#1c94a3]";
  if (h >= 60) return "text-[#3eacab]";
  if (h >= 50) return "text-[#6bc2bc]";
  if (h >= 40) return "text-[#38a74b]";
  if (h >= 30) return "text-[#c98f48]";
  if (h >= 20) return "text-[#bf4f1e]";
  if (h >= 10) return "text-[#c12400]";
  return "text-[#e50000]";
}

export function getHumidityBorderColor(h: number): string {
  if (h >= 100) return "border-[#2e3a69]";
  if (h >= 90) return "border-[#3c74a6]";
  if (h >= 80) return "border-[#1794b1]";
  if (h >= 70) return "border-[#1c94a3]";
  if (h >= 60) return "border-[#3eacab]";
  if (h >= 50) return "border-[#6bc2bc]";
  if (h >= 40) return "border-[#38a74b]";
  if (h >= 30) return "border-[#c98f48]";
  if (h >= 20) return "border-[#bf4f1e]";
  if (h >= 10) return "border-[#c12400]";
  return "border-[#e50000]";
}

export function getHumidityLineColor(h: number): string {
  if (h >= 100) return "rgb(46,58,105)";
  if (h >= 90) return "rgb(60,116,166)";
  if (h >= 80) return "rgb(23,148,177)";
  if (h >= 70) return "rgb(28,148,163)";
  if (h >= 60) return "rgb(62,172,171)";
  if (h >= 50) return "rgb(107,194,188)";
  if (h >= 40) return "rgb(56,167,75)";
  if (h >= 30) return "rgb(201,143,72)";
  if (h >= 20) return "rgb(191,79,30)";
  if (h >= 10) return "rgb(193,36,0)";
  return "rgb(229,0,0)";
}

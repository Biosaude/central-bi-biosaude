import { BarChart3, ShieldCheck, Users, Activity, Layers } from "lucide-react";
export const icons = {
  chart: BarChart3,
  shield: ShieldCheck,
  users: Users,
  activity: Activity,
  layers: Layers,
};
export function DashboardIcon({
  name,
  size = 22,
}: {
  name: keyof typeof icons;
  size?: number;
}) {
  const Icon = icons[name] || Layers;
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}

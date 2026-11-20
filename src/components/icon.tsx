import {
  Banknote, BedDouble, Boxes, Briefcase, CalendarCheck, Clipboard, Clock, Compass, Contact, Cpu, Factory, FolderKanban,
  GraduationCap, Heart, Landmark, Megaphone, Package, Receipt, Route, Settings, ShoppingCart, Sparkles, Sprout, Star,
  Store, Target, Truck, Users, UtensilsCrossed, Vault, Wallet, Wrench, type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  receipt: Receipt, "shopping-cart": ShoppingCart, contact: Contact, target: Target, "calendar-check": CalendarCheck,
  bed: BedDouble, "graduation-cap": GraduationCap, utensils: UtensilsCrossed, boxes: Boxes, truck: Truck, factory: Factory,
  folder: FolderKanban, clock: Clock, route: Route, sprout: Sprout, wallet: Wallet, users: Users, banknote: Banknote,
  clipboard: Clipboard, wrench: Wrench, star: Star, package: Package, heart: Heart, briefcase: Briefcase, store: Store,
  vault: Vault, compass: Compass, landmark: Landmark, settings: Settings, cpu: Cpu, megaphone: Megaphone, sparkles: Sparkles,
};

export const ICON_NAMES = Object.keys(MAP);

export function Icon({ name, className = "size-4" }: { name: string; className?: string }) {
  const C = MAP[name] ?? Clipboard;
  return <C className={className} strokeWidth={1.75} aria-hidden />;
}

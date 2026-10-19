import {
  Ban,
  Bell,
  Building,
  Calculator,
  Camera,
  Check,
  CircleCheck,
  CircleQuestionMark,
  CirclePause,
  CircleX,
  Clock,
  ClockAlert,
  ClockFading,
  CloudOff,
  Download,
  DraftingCompass,
  Ellipsis,
  Forward,
  Funnel,
  FolderKanban,
  House,
  Inbox,
  Info,
  Landmark,
  Lock,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Package,
  Paperclip,
  Pencil,
  PencilLine,
  PanelLeftClose,
  Pin,
  Plus,
  Printer,
  Save,
  RefreshCw,
  ScanLine,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Trash,
  TriangleAlert,
  Truck,
  Undo2,
  Upload,
  Users,
  ArrowUpDown,
  ArrowUpRight,
  HardHat,
  ChartColumn,
  type LucideIcon,
} from "lucide-react";

// Semantic icon keys (DS-10). Modules reference these keys only, never glyph components.
export const ICONS = {
  // Groups (DS-13)
  "erp.group.home": House,
  "erp.group.projects": FolderKanban,
  "erp.group.engineering": DraftingCompass,
  "erp.group.commercial": Calculator,
  "erp.group.site": HardHat,
  "erp.group.supply": Package,
  "erp.group.plant": Truck,
  "erp.group.workforce": Users,
  "erp.group.qhse": ShieldCheck,
  "erp.group.finance": Landmark,
  "erp.group.insights": ChartColumn,
  "erp.group.collab": MessagesSquare,
  "erp.group.admin": Settings,

  // Workflow states (DS-6)
  "erp.state.draft": PencilLine,
  "erp.state.review": Clock,
  "erp.state.returned": Undo2,
  "erp.state.approved": CircleCheck,
  "erp.state.rejected": CircleX,
  "erp.state.cancelled": Ban,
  "erp.state.locked": Lock,
  "erp.state.hold": CirclePause,
  "erp.state.overdue": ClockAlert,
  "erp.state.exception": TriangleAlert,
  "erp.state.sync": CloudOff,

  // Actions (DS-10)
  "erp.action.create": Plus,
  "erp.action.edit": Pencil,
  "erp.action.save": Save,
  "erp.action.submit": Send,
  "erp.action.approve": Check,
  "erp.action.reject": CircleX,
  "erp.action.return": Undo2,
  "erp.action.delegate": Forward,
  "erp.action.cancel": Ban,
  "erp.action.delete": Trash,
  "erp.action.attach": Paperclip,
  "erp.action.comment": MessageSquare,
  "erp.action.export": Download,
  "erp.action.import": Upload,
  "erp.action.print": Printer,
  "erp.action.filter": Funnel,
  "erp.action.sort": ArrowUpDown,
  "erp.action.search": Search,
  "erp.action.settings": SlidersHorizontal,
  "erp.action.lock": Lock,
  "erp.action.history": ClockFading,
  "erp.action.drill": ArrowUpRight,
  "erp.action.refresh": RefreshCw,
  "erp.action.more": Ellipsis,
  "erp.action.pin": Pin,
  "erp.action.info": Info,
  "erp.action.why": CircleQuestionMark,
  "erp.action.ai": Sparkles,
  "erp.action.notify": Bell,
  "erp.action.inbox": Inbox,
  "erp.action.location": MapPin,
  "erp.action.camera": Camera,
  "erp.action.scan": ScanLine,
  "erp.action.offline": CloudOff,

  // Shell
  "erp.shell.company": Building,
  "erp.shell.nav": PanelLeftClose,
  "erp.shell.info": Info,
} as const satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof ICONS;

export function Icon({
  name,
  size,
  label,
  className,
}: {
  name: IconKey;
  size?: number;
  /** Accessible name. Omit for decorative icons that sit beside visible text. */
  label?: string;
  className?: string;
}) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size ?? 20}
      strokeWidth={1.75}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

import { vi } from "vitest";

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

if (typeof globalThis.__DEV__ === "undefined") {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const secureStoreMockState = new Map<string, string>();

vi.mock("expo", () => ({
  default: {
    Constants: {
      expoConfig: null,
    },
  },
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: null,
  },
}));

vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: 1,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 2,
  ALWAYS: 3,
  ALWAYS_THIS_DEVICE_ONLY: 4,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 5,
  WHEN_UNLOCKED: 6,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
  isAvailableAsync: vi.fn(async () => true),
  getItem: vi.fn((key: string) => secureStoreMockState.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    secureStoreMockState.set(key, value);
  }),
  deleteItem: vi.fn((key: string) => {
    secureStoreMockState.delete(key);
  }),
  getItemAsync: vi.fn(async (key: string) => secureStoreMockState.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStoreMockState.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStoreMockState.delete(key);
  }),
}));

vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000001"),
}));

vi.mock("expo-modules-core", () => ({
  EventEmitter: class {},
  requireNativeModule: () => ({}),
  requireOptionalNativeModule: () => null,
  createPermissionHook: () => () => ({ status: "granted" }),
}));

vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
}));

vi.mock("lucide-react-native", () => {
  const Icon = () => null;

  return {
    __esModule: true,
    Activity: Icon,
    ActivitySquare: Icon,
    ArrowUpRight: Icon,
    Brain: Icon,
    Calendar: Icon,
    CalendarDays: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    CircleUserRound: Icon,
    Clock: Icon,
    Copy: Icon,
    Dumbbell: Icon,
    FileText: Icon,
    HeartPulse: Icon,
    LayoutList: Icon,
    LibraryBig: Icon,
    List: Icon,
    Mic: Icon,
    Pause: Icon,
    Play: Icon,
    Plus: Icon,
    Search: Icon,
    SlidersHorizontal: Icon,
    Settings: Icon,
    Share2: Icon,
    Sparkles: Icon,
    Trash2: Icon,
    X: Icon,
    UserPlus: Icon,
    UsersRound: Icon,
    Waypoints: Icon,
  };
});

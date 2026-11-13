"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import {
  Utensils,
  Plus,
  CheckCircle2,
  Clock,
  DollarSign,
  Users,
  ClipboardList,
  Trash2,
  Edit3,
  Copy,
  Check,
  Search,
  Download,
  Phone,
  MapPin,
  Calendar,
  AlertCircle,
  Wifi,
  WifiOff,
  Sparkles,
  ArrowLeft,
  ArrowUpDown,
} from "lucide-react";

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// --- TYPES ---
interface Order {
  id: string;
  name: string;
  tier: "full" | "small";
  meat: string;
  sides: string[];
  bread: string;
  dessert: string;
  drink: string;
  qty: number;
  notes: string;
  paid: boolean;
  pickedUp: boolean;
  incomplete: boolean;
  createdAt: number;
}

interface MenuData {
  meats: string[];
  sides: string[];
  breads: string[];
  desserts: string[];
  drinks: string[];
}

interface SaleInfo {
  title: string;
  dateTime: string;
  location: string;
  contact: string;
  paymentMethods: string;
  note: string;
}

// --- DEFAULT DATA ---
const INITIAL_MENU: MenuData = {
  meats: ["Ham", "Baked Turkey Wings", "Baked Chicken", "None (Veggie Plate)"],
  sides: [
    "Dressing",
    "Baked Mac n Cheese",
    "Candied Yams",
    "Green Beans",
    "Rice",
    "Collards",
  ],
  breads: ["Roll", "Cornbread", "No Bread"],
  desserts: ["Chef's Choice", "Cake Slice", "No Dessert"],
  drinks: ["Bottled Water", "Soda", "No Drink"],
};

const INITIAL_SALE_INFO: SaleInfo = {
  title: "LOV Plate Sale",
  dateTime: "Saturday • Starting at 12:00 PM until Sold Out",
  location: "Pickup & Local Delivery Available",
  contact: "Text or Call to Confirm Orders",
  paymentMethods: "Cash • Cash App • Zelle",
  note: "Full Plate ($15): 1 Meat, 2 Sides, Bread, Dessert & Drink | 1-Side or Veggie Plate ($12)",
};

const SEED_ORDERS: Order[] = [
  {
    id: "seed-roger",
    name: "Roger",
    tier: "full",
    meat: "Ham",
    sides: ["Dressing", "Green Beans"],
    bread: "Roll",
    dessert: "Chef's Choice",
    drink: "Bottled Water",
    qty: 1,
    notes: "",
    paid: false,
    pickedUp: false,
    incomplete: false,
    createdAt: 1700000001000,
  },
  {
    id: "seed-leon",
    name: "Leon",
    tier: "full",
    meat: "Baked Turkey Wings",
    sides: ["Dressing", "Green Beans"],
    bread: "Roll",
    dessert: "Chef's Choice",
    drink: "Bottled Water",
    qty: 1,
    notes: "",
    paid: false,
    pickedUp: false,
    incomplete: false,
    createdAt: 1700000002000,
  },
  {
    id: "seed-pie",
    name: "Pie",
    tier: "full",
    meat: "Ham",
    sides: ["Dressing", "Baked Mac n Cheese"],
    bread: "Roll",
    dessert: "Chef's Choice",
    drink: "Bottled Water",
    qty: 1,
    notes: "",
    paid: false,
    pickedUp: false,
    incomplete: false,
    createdAt: 1700000003000,
  },
  {
    id: "seed-ronnie",
    name: "Ronnie",
    tier: "full",
    meat: "",
    sides: [],
    bread: "Roll",
    dessert: "Chef's Choice",
    drink: "Bottled Water",
    qty: 1,
    notes: "Waiting on meat & side choices",
    paid: false,
    pickedUp: false,
    incomplete: true,
    createdAt: 1700000004000,
  },
];

// Helper: True if order is missing meat or sides, OR explicitly flagged incomplete
const isOrderIncomplete = (o: Order) =>
  Boolean(o.incomplete) || !o.meat || !o.sides || o.sides.length === 0;

export default function AdminPlateSaleDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menu, setMenu] = useState<MenuData>(INITIAL_MENU);
  const [saleInfo, setSaleInfo] = useState<SaleInfo>(INITIAL_SALE_INFO);
  const [loading, setLoading] = useState(true);

  // UI Tabs, Filters & Sorting
  const [activeTab, setActiveTab] = useState<"orders" | "prep" | "menu">("orders");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "unpaid" | "pending" | "incomplete" | "completed"
  >("all");
  const [sortBy, setSortBy] = useState<
    "oldest" | "newest" | "alpha" | "highest" | "lowest"
  >("oldest");
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [copiedMenu, setCopiedMenu] = useState(false);

  // Order Form State
  const [customerName, setCustomerName] = useState("");
  const [tier, setTier] = useState<"full" | "small">("full");
  const [selectedMeat, setSelectedMeat] = useState("Ham");
  const [selectedSides, setSelectedSides] = useState<string[]>([
    "Dressing",
    "Green Beans",
  ]);
  const [selectedBread, setSelectedBread] = useState("Roll");
  const [selectedDessert, setSelectedDessert] = useState("Chef's Choice");
  const [selectedDrink, setSelectedDrink] = useState("Bottled Water");
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [paid, setPaid] = useState(false);

  // Menu Editor State
  const [newItemCategory, setNewItemCategory] = useState<keyof MenuData>("sides");
  const [newItemName, setNewItemName] = useState("");

  // 1. Authenticate Anonymously
  useEffect(() => {
    signInAnonymously(auth).catch((err) => console.error("Auth error:", err));
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  // 2. Real-time Firestore Listeners
  useEffect(() => {
    if (!user) return;

    const ordersRef = collection(db, "orders");
    const unsubOrders = onSnapshot(ordersRef, async (snapshot) => {
      if (snapshot.empty && !localStorage.getItem("fps_seeded_v1")) {
        localStorage.setItem("fps_seeded_v1", "true");
        const batch = writeBatch(db);
        SEED_ORDERS.forEach((o) => {
          batch.set(doc(db, "orders", o.id), o);
        });
        await batch.commit();
        return;
      }
      const fetched: Order[] = [];
      snapshot.forEach((docSnap) => {
        fetched.push(docSnap.data() as Order);
      });
      setOrders(fetched);
      setLoading(false);
    });

    const menuDocRef = doc(db, "settings", "menu");
    const unsubMenu = onSnapshot(menuDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as MenuData;
        const allowedDrinks = ["Bottled Water", "Soda", "No Drink"];
        const hasChefsChoiceDessert = data.desserts?.includes("Chef's Choice");
        const needsDrinkSync =
          !data.drinks ||
          data.drinks.length !== allowedDrinks.length ||
          !allowedDrinks.every((d) => data.drinks.includes(d));

        if (needsDrinkSync || !hasChefsChoiceDessert) {
          const updatedDesserts = hasChefsChoiceDessert
            ? data.desserts
            : ["Chef's Choice", ...(data.desserts || ["Cake Slice", "No Dessert"])];
          const syncedMenu: MenuData = {
            ...data,
            drinks: allowedDrinks,
            desserts: updatedDesserts,
          };
          await setDoc(menuDocRef, syncedMenu);
          setMenu(syncedMenu);
        } else {
          setMenu(data);
        }
      } else {
        await setDoc(menuDocRef, INITIAL_MENU);
      }
    });

    const infoDocRef = doc(db, "settings", "saleInfo");
    const unsubInfo = onSnapshot(infoDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const info = docSnap.data() as SaleInfo;
        if (info.title === "LOV, Plate Sale" || info.title === "Family Plate Sale") {
          const updatedInfo = { ...info, title: "LOV Plate Sale" };
          await setDoc(infoDocRef, updatedInfo);
          setSaleInfo(updatedInfo);
        } else {
          setSaleInfo(info);
        }
      } else {
        await setDoc(infoDocRef, INITIAL_SALE_INFO);
      }
    });

    return () => {
      unsubOrders();
      unsubMenu();
      unsubInfo();
    };
  }, [user]);

  // Price Calculation
  const unitPrice = tier === "full" ? 15 : 12;
  const calculatedTotal = unitPrice * qty;

  // Toggle side selection with tier constraints
  const handleToggleSide = (side: string) => {
    const isVeggie = selectedMeat.toLowerCase().includes("veggie");
    const maxSides = tier === "full" ? 2 : isVeggie ? 3 : 1;

    if (selectedSides.includes(side)) {
      setSelectedSides(selectedSides.filter((s) => s !== side));
    } else if (selectedSides.length >= maxSides) {
      setSelectedSides([...selectedSides.slice(1), side]);
    } else {
      setSelectedSides([...selectedSides, side]);
    }
  };

  // Switch Tier cleanly
  const handleTierChange = (newTier: "full" | "small") => {
    setTier(newTier);
    const isVeggie = selectedMeat.toLowerCase().includes("veggie");
    if (newTier === "small" && !isVeggie && selectedSides.length > 1) {
      setSelectedSides(selectedSides.slice(0, 1));
    }
  };

  // Submit or Update Order
  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return;

    const id = editingOrderId || `order-${Date.now()}`;
    const existing = orders.find((o) => o.id === editingOrderId);

    const orderPayload: Order = {
      id,
      name: customerName.trim(),
      tier,
      meat: selectedMeat,
      sides: selectedSides,
      bread: selectedBread,
      dessert: tier === "full" ? selectedDessert : "Not Included ($12 Plate)",
      drink: tier === "full" ? selectedDrink : "Not Included ($12 Plate)",
      qty: Math.max(1, qty),
      notes: notes.trim(),
      paid,
      pickedUp: existing ? Boolean(existing.pickedUp) : false,
      incomplete: !selectedMeat || selectedSides.length === 0,
      createdAt: existing ? existing.createdAt : Date.now(),
    };

    await setDoc(doc(db, "orders", id), orderPayload);
    resetForm();
  };

  const resetForm = () => {
    setEditingOrderId(null);
    setCustomerName("");
    setTier("full");
    setSelectedMeat(menu.meats[0] || "Ham");
    setSelectedSides(menu.sides.slice(0, 2));
    setSelectedBread(menu.breads[0] || "Roll");
    setSelectedDessert(menu.desserts[0] || "Chef's Choice");
    setSelectedDrink(menu.drinks[0] || "Bottled Water");
    setQty(1);
    setNotes("");
    setPaid(false);
  };

  const handleEditOrder = (order: Order) => {
    setEditingOrderId(order.id);
    setCustomerName(order.name);
    setTier(order.tier);
    setSelectedMeat(order.meat || menu.meats[0] || "Ham");
    setSelectedSides(order.sides || []);
    setSelectedBread(order.bread || menu.breads[0] || "Roll");
    setSelectedDessert(
      order.dessert && !order.dessert.includes("Not Included")
        ? order.dessert
        : menu.desserts[0] || "Chef's Choice"
    );
    setSelectedDrink(
      order.drink && !order.drink.includes("Not Included")
        ? order.drink
        : menu.drinks[0] || "Bottled Water"
    );
    setQty(order.qty);
    setNotes(order.notes);
    setPaid(Boolean(order.paid));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const togglePaid = async (order: Order) => {
    await updateDoc(doc(db, "orders", order.id), { paid: !Boolean(order.paid) });
  };

  const togglePickedUp = async (order: Order) => {
    await updateDoc(doc(db, "orders", order.id), {
      pickedUp: !Boolean(order.pickedUp),
    });
  };

  const handleDeleteOrder = async (id: string) => {
    await deleteDoc(doc(db, "orders", id));
    if (editingOrderId === id) resetForm();
  };

  // Menu Management
  const handleAddMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    const updated: MenuData = {
      ...menu,
      [newItemCategory]: [...menu[newItemCategory], newItemName.trim()],
    };
    await setDoc(doc(db, "settings", "menu"), updated);
    setNewItemName("");
  };

  const handleRemoveMenuItem = async (
    category: keyof MenuData,
    itemToRemove: string
  ) => {
    const updated: MenuData = {
      ...menu,
      [category]: menu[category].filter((item) => item !== itemToRemove),
    };
    await setDoc(doc(db, "settings", "menu"), updated);
  };

  // Summary Stats & Tab Counts
  const stats = useMemo(() => {
    let totalPlates = 0;
    let totalRevenue = 0;
    let collectedRevenue = 0;
    let pendingPickupPlates = 0;

    let unpaidCount = 0;
    let pendingCount = 0;
    let incompleteCount = 0;
    let completedCount = 0;

    orders.forEach((o) => {
      const price = (o.tier === "full" ? 15 : 12) * o.qty;
      const isPaid = Boolean(o.paid);
      const isPickedUp = Boolean(o.pickedUp);
      const isInc = isOrderIncomplete(o);

      totalPlates += o.qty;
      totalRevenue += price;
      if (isPaid) collectedRevenue += price;
      if (!isPickedUp) pendingPickupPlates += o.qty;

      if (!isPaid) unpaidCount += 1;
      if (!isPickedUp) pendingCount += 1;
      if (isInc) incompleteCount += 1;
      if (isPickedUp) completedCount += 1;
    });

    return {
      totalPlates,
      totalRevenue,
      collectedRevenue,
      pendingPickupPlates,
      unpaidCount,
      pendingCount,
      incompleteCount,
      completedCount,
    };
  }, [orders]);

  // Kitchen Prep Tally
  const prepTally = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {
      Meats: {},
      Sides: {},
      Breads: {},
      Desserts: {},
      Drinks: {},
    };

    orders.forEach((o) => {
      if (o.meat && !o.meat.toLowerCase().includes("none")) {
        counts.Meats[o.meat] = (counts.Meats[o.meat] || 0) + o.qty;
      }
      (o.sides || []).forEach((s) => {
        counts.Sides[s] = (counts.Sides[s] || 0) + o.qty;
      });
      if (o.bread && !o.bread.toLowerCase().includes("no bread")) {
        counts.Breads[o.bread] = (counts.Breads[o.bread] || 0) + o.qty;
      }
      if (
        o.tier === "full" &&
        o.dessert &&
        !o.dessert.toLowerCase().includes("no dessert")
      ) {
        counts.Desserts[o.dessert] = (counts.Desserts[o.dessert] || 0) + o.qty;
      }
      if (
        o.tier === "full" &&
        o.drink &&
        !o.drink.toLowerCase().includes("no drink")
      ) {
        counts.Drinks[o.drink] = (counts.Drinks[o.drink] || 0) + o.qty;
      }
    });

    return counts;
  }, [orders]);

  // Filtered & Sorted Orders
  const displayedOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = orders.filter((o) => {
      const matchesSearch =
        !query ||
        o.name.toLowerCase().includes(query) ||
        (o.meat || "").toLowerCase().includes(query) ||
        (o.sides || []).join(" ").toLowerCase().includes(query);

      if (!matchesSearch) return false;

      if (filterStatus === "unpaid") return !Boolean(o.paid);
      if (filterStatus === "pending") return !Boolean(o.pickedUp);
      if (filterStatus === "incomplete") return isOrderIncomplete(o);
      if (filterStatus === "completed") return Boolean(o.pickedUp);
      return true;
    });

    return [...filtered].sort((a, b) => {
      const totalA = (a.tier === "full" ? 15 : 12) * a.qty;
      const totalB = (b.tier === "full" ? 15 : 12) * b.qty;

      if (sortBy === "alpha") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      if (sortBy === "highest") {
        return totalB - totalA;
      }
      if (sortBy === "lowest") {
        return totalA - totalB;
      }
      if (sortBy === "newest") {
        return (b.createdAt || 0) - (a.createdAt || 0);
      }
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }, [orders, searchQuery, filterStatus, sortBy]);

  // Shareable Promo Text
  const handleCopyPromo = () => {
    const text = `🍽️ ${saleInfo.title.toUpperCase()} 🍽️
📅 ${saleInfo.dateTime}
📍 ${saleInfo.location}

💲 PRICING:
• Full Plate ($15): 1 Meat, 2 Sides, Bread, Dessert & Drink
• 1-Side / Veggie Plate ($12): 1 Meat + 1 Side OR 3-Side Veggie Plate

🍖 MEATS: ${menu.meats.filter((m) => !m.includes("None")).join(", ")}
🥗 SIDES: ${menu.sides.join(", ")}
🥖 BREAD: ${menu.breads.filter((b) => !b.includes("No")).join(", ")}
🍰 DESSERTS: ${menu.desserts.filter((d) => !d.includes("No")).join(", ")}
🥤 DRINKS: ${menu.drinks.filter((d) => !d.includes("No")).join(", ")}

💳 ${saleInfo.paymentMethods}
📞 ${saleInfo.contact}`;

    navigator.clipboard.writeText(text);
    setCopiedMenu(true);
    setTimeout(() => setCopiedMenu(false), 2500);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      "Name",
      "Tier",
      "Meat",
      "Sides",
      "Bread",
      "Dessert",
      "Drink",
      "Qty",
      "Total ($)",
      "Paid",
      "Picked Up",
      "Notes",
    ];
    const rows = orders.map((o) => [
      `"${o.name}"`,
      o.tier === "full" ? "Full Plate ($15)" : "1-Side/Veggie ($12)",
      `"${o.meat}"`,
      `"${(o.sides || []).join(", ")}"`,
      `"${o.bread}"`,
      `"${o.dessert}"`,
      `"${o.drink}"`,
      o.qty,
      (o.tier === "full" ? 15 : 12) * o.qty,
      o.paid ? "Yes" : "No",
      o.pickedUp ? "Yes" : "No",
      `"${o.notes}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lov-plate-sale-orders.csv";
    a.click();
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-16">
      {/* TOP HEADER */}
      <header className="bg-amber-900 text-amber-50 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Utensils className="w-6 h-6 text-amber-300" />
              <h1 className="text-2xl font-bold tracking-tight">{saleInfo.title}</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-800/80 text-emerald-200 border border-emerald-600/40">
                {user ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {user ? "Live Synced" : "Connecting..."}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-amber-200">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> {saleInfo.dateTime}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {saleInfo.location}
              </span>
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> {saleInfo.paymentMethods}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-950/60 hover:bg-amber-950 text-amber-100 border border-amber-700 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Storefront
            </Link>
            <button
              onClick={handleCopyPromo}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-800 hover:bg-amber-700 text-amber-100 border border-amber-700 transition cursor-pointer"
            >
              {copiedMenu ? (
                <Check className="w-4 h-4 text-emerald-300" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {copiedMenu ? "Copied Menu!" : "Copy Menu Text"}
            </button>
            <button
              onClick={() => setShowInfoModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-950 hover:bg-amber-100 transition cursor-pointer"
            >
              <Edit3 className="w-4 h-4" /> Edit Sale Info
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-6 space-y-6">
        {/* LIVE STATS BAR */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
            <div className="flex items-center justify-between text-stone-500 text-xs font-medium uppercase">
              <span>Total Plates</span>
              <Users className="w-4 h-4 text-amber-600" />
            </div>
            <p className="mt-1.5 text-2xl font-bold text-stone-900">
              {stats.totalPlates}
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              {orders.length} customer orders
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
            <div className="flex items-center justify-between text-stone-500 text-xs font-medium uppercase">
              <span>Expected Total</span>
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="mt-1.5 text-2xl font-bold text-stone-900">
              ${stats.totalRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-stone-500 mt-0.5">All logged plates</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
            <div className="flex items-center justify-between text-stone-500 text-xs font-medium uppercase">
              <span>Cash Collected</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="mt-1.5 text-2xl font-bold text-emerald-700">
              ${stats.collectedRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              ${(stats.totalRevenue - stats.collectedRevenue).toFixed(2)} unpaid
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
            <div className="flex items-center justify-between text-stone-500 text-xs font-medium uppercase">
              <span>Plates To Pack</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <p className="mt-1.5 text-2xl font-bold text-amber-700">
              {stats.pendingPickupPlates}
            </p>
            <p className="text-xs text-stone-500 mt-0.5">Not yet picked up</p>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("orders")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
                activeTab === "orders"
                  ? "bg-amber-800 text-white shadow-sm"
                  : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
              }`}
            >
              Orders & Calculator
            </button>
            <button
              onClick={() => setActiveTab("prep")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === "prep"
                  ? "bg-amber-800 text-white shadow-sm"
                  : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
              }`}
            >
              <ClipboardList className="w-4 h-4" /> Kitchen Prep Tally
            </button>
            <button
              onClick={() => setActiveTab("menu")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === "menu"
                  ? "bg-amber-800 text-white shadow-sm"
                  : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
              }`}
            >
              <Sparkles className="w-4 h-4" /> Menu & Offerings
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV Backup
          </button>
        </div>

        {/* TAB 1: ORDERS & AUTO-CALCULATOR */}
        {activeTab === "orders" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT: ORDER BUILDER FORM */}
            <form
              onSubmit={handleSaveOrder}
              className="lg:col-span-5 bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-stone-900">
                  {editingOrderId ? "Edit Customer Order" : "Add New Plate Order"}
                </h2>
                {editingOrderId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs text-stone-500 hover:text-stone-800 underline cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {/* Customer Name */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Aunt Mae, Marcus..."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>

              {/* Plate Tier Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
                  Select Plate Option
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleTierChange("full")}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      tier === "full"
                        ? "border-amber-700 bg-amber-50 ring-2 ring-amber-600/30"
                        : "border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-sm text-stone-900">
                      <span>Full Plate</span>
                      <span className="text-amber-800">$15</span>
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1 leading-tight">
                      1 Meat, 2 Sides, Bread, Dessert & Drink
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTierChange("small")}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      tier === "small"
                        ? "border-amber-700 bg-amber-50 ring-2 ring-amber-600/30"
                        : "border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-sm text-stone-900">
                      <span>1-Side / Veggie</span>
                      <span className="text-amber-800">$12</span>
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1 leading-tight">
                      1 Meat + 1 Side, OR 3-Side Veggie Plate
                    </p>
                  </button>
                </div>
              </div>

              {/* COLOR-CODED MEAT SELECTION (RED) */}
              <div>
                <label className="block text-xs font-bold uppercase text-red-700 mb-1">
                  Meat Choice
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {menu.meats.map((meat) => (
                    <button
                      type="button"
                      key={meat}
                      onClick={() => setSelectedMeat(meat)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer ${
                        selectedMeat === meat
                          ? "bg-red-700 text-white border-red-700 shadow-xs"
                          : "bg-red-50/70 text-red-900 border-red-200 hover:bg-red-100"
                      }`}
                    >
                      {meat}
                    </button>
                  ))}
                </div>
              </div>

              {/* COLOR-CODED SIDES SELECTION (GREEN) */}
              <div>
                <label className="block text-xs font-bold uppercase text-emerald-700 mb-1">
                  Sides (Pick up to{" "}
                  {tier === "full"
                    ? "2"
                    : selectedMeat.toLowerCase().includes("veggie")
                    ? "3"
                    : "1"}
                  )
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {menu.sides.map((side) => {
                    const active = selectedSides.includes(side);
                    return (
                      <button
                        type="button"
                        key={side}
                        onClick={() => handleToggleSide(side)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer ${
                          active
                            ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                            : "bg-emerald-50/70 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
                        }`}
                      >
                        {active ? `✓ ${side}` : side}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* COLOR-CODED BREAD (ORANGE), DRINK (BLUE), & DESSERT (PURPLE) */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-orange-700 mb-1">
                    Bread
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {menu.breads.map((b) => (
                      <button
                        type="button"
                        key={b}
                        onClick={() => setSelectedBread(b)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer ${
                          selectedBread === b
                            ? "bg-orange-600 text-white border-orange-600 shadow-xs"
                            : "bg-orange-50/70 text-orange-900 border-orange-200 hover:bg-orange-100"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                {tier === "full" && (
                  <>
                    <div>
                      <label className="block text-xs font-bold uppercase text-blue-700 mb-1">
                        Drink
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {menu.drinks.map((dr) => (
                          <button
                            type="button"
                            key={dr}
                            onClick={() => setSelectedDrink(dr)}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer ${
                              selectedDrink === dr
                                ? "bg-blue-700 text-white border-blue-700 shadow-xs"
                                : "bg-blue-50/70 text-blue-900 border-blue-200 hover:bg-blue-100"
                            }`}
                          >
                            {dr}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-purple-700 mb-1">
                        Dessert
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {menu.desserts.map((d) => (
                          <button
                            type="button"
                            key={d}
                            onClick={() => setSelectedDessert(d)}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer ${
                              selectedDessert === d
                                ? "bg-purple-700 text-white border-purple-700 shadow-xs"
                                : "bg-purple-50/70 text-purple-900 border-purple-200 hover:bg-purple-100"
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Quantity & Auto-Calculated Price */}
              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center justify-between">
                <div>
                  <label className="block text-xs font-semibold uppercase text-amber-950 mb-1">
                    # of Plates
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQty(Math.max(1, qty - 1))}
                      className="w-8 h-8 rounded-lg bg-white border border-amber-300 font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(e) =>
                        setQty(Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="w-14 text-center py-1 rounded-lg border border-amber-300 bg-white font-bold text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setQty(qty + 1)}
                      className="w-8 h-8 rounded-lg bg-white border border-amber-300 font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-medium text-amber-800 block">
                    {qty} × ${unitPrice}
                  </span>
                  <span className="text-2xl font-extrabold text-amber-950">
                    ${calculatedTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Notes & Paid Checkbox */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder="Optional notes (e.g., extra gravy, 2pm pickup)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-stone-300 text-xs"
                />
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={paid}
                    onChange={(e) => setPaid(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                  Already Paid
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-amber-800 hover:bg-amber-900 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {editingOrderId
                  ? "Update Order"
                  : `Save Order ($${calculatedTotal})`}
              </button>
            </form>

            {/* RIGHT: LIVE ORDER LIST WITH WORKING FILTER TABS & SORTING */}
            <div className="lg:col-span-7 space-y-4">
              {/* Search, Filter Tabs & Sort Bar */}
              <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search name, meat, or side..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
                    />
                  </div>

                  {/* SORT DROPDOWN */}
                  <div className="flex items-center gap-1.5">
                    <ArrowUpDown className="w-4 h-4 text-stone-500 shrink-0" />
                    <select
                      value={sortBy}
                      onChange={(e) =>
                        setSortBy(
                          e.target.value as
                            | "oldest"
                            | "newest"
                            | "alpha"
                            | "highest"
                            | "lowest"
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs font-semibold bg-stone-50 text-stone-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-600"
                    >
                      <option value="oldest">Order Added (First → Last)</option>
                      <option value="newest">Newest First</option>
                      <option value="alpha">Alphabetical (A → Z)</option>
                      <option value="highest">Highest Total ($ → $)</option>
                      <option value="lowest">Lowest Total ($ → $)</option>
                    </select>
                  </div>
                </div>

                {/* CLICKABLE STATUS FILTER TABS */}
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFilterStatus("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      filterStatus === "all"
                        ? "bg-stone-900 text-white"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    All ({orders.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterStatus("unpaid")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      filterStatus === "unpaid"
                        ? "bg-rose-700 text-white"
                        : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100"
                    }`}
                  >
                    Unpaid ({stats.unpaidCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterStatus("pending")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      filterStatus === "pending"
                        ? "bg-amber-700 text-white"
                        : "bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100"
                    }`}
                  >
                    Pending Pickup ({stats.pendingCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterStatus("incomplete")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      filterStatus === "incomplete"
                        ? "bg-orange-600 text-white"
                        : "bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100"
                    }`}
                  >
                    Incomplete ({stats.incompleteCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterStatus("completed")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      filterStatus === "completed"
                        ? "bg-emerald-700 text-white"
                        : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                    }`}
                  >
                    Completed ({stats.completedCount})
                  </button>
                </div>
              </div>

              {/* Orders Feed */}
              {loading ? (
                <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center text-sm text-stone-500">
                  Syncing live orders...
                </div>
              ) : displayedOrders.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center text-sm text-stone-500">
                  No orders in this tab right now.
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedOrders.map((order) => {
                    const orderTotal =
                      (order.tier === "full" ? 15 : 12) * order.qty;
                    const isInc = isOrderIncomplete(order);
                    return (
                      <div
                        key={order.id}
                        className={`bg-white p-4 rounded-2xl border transition shadow-sm ${
                          isInc
                            ? "border-amber-400 bg-amber-50/30"
                            : order.pickedUp
                            ? "border-blue-200 bg-blue-50/20"
                            : "border-stone-200"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-base text-stone-900">
                                {order.name}
                              </h3>
                              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900">
                                {order.qty}x{" "}
                                {order.tier === "full"
                                  ? "Full ($15)"
                                  : "1-Side/Veggie ($12)"}
                              </span>
                              {isInc && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-200 text-amber-950">
                                  <AlertCircle className="w-3 h-3" /> Needs
                                  Selections
                                </span>
                              )}
                              {order.pickedUp && !order.paid && (
                                <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-800">
                                  Picked Up • Still Unpaid
                                </span>
                              )}
                            </div>

                            {/* COLOR-CODED ITEM TAGS ON ORDER CARD */}
                            {isInc ? (
                              <p className="text-sm italic text-stone-500 mt-1.5">
                                Click Edit to fill in meat & sides
                              </p>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {order.meat && (
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-900">
                                    {order.meat}
                                  </span>
                                )}
                                {(order.sides || []).map((side) => (
                                  <span
                                    key={side}
                                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900"
                                  >
                                    {side}
                                  </span>
                                ))}
                                {order.bread && (
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-900">
                                    {order.bread}
                                  </span>
                                )}
                                {order.tier === "full" &&
                                  order.drink &&
                                  !order.drink.includes("Not Included") && (
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-900">
                                      {order.drink}
                                    </span>
                                  )}
                                {order.tier === "full" &&
                                  order.dessert &&
                                  !order.dessert.includes("Not Included") && (
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-900">
                                      {order.dessert}
                                    </span>
                                  )}
                              </div>
                            )}

                            {order.notes && (
                              <p className="text-xs text-amber-800 bg-amber-50 px-2 py-1 rounded mt-1.5 inline-block">
                                Note: {order.notes}
                              </p>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="text-lg font-extrabold text-stone-900">
                              ${orderTotal.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* QUICK ACTION PILL CIRCLES */}
                        <div className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => togglePaid(order)}
                              className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                                order.paid
                                  ? "bg-emerald-600 text-white shadow-xs hover:bg-emerald-700"
                                  : "bg-stone-100 text-stone-600 border border-stone-300 hover:bg-stone-200"
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  order.paid ? "bg-white" : "bg-stone-400"
                                }`}
                              />
                              {order.paid ? "Paid" : "Mark Paid"}
                            </button>

                            <button
                              type="button"
                              onClick={() => togglePickedUp(order)}
                              className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                                order.pickedUp
                                  ? "bg-blue-600 text-white shadow-xs hover:bg-blue-700"
                                  : "bg-stone-100 text-stone-600 border border-stone-300 hover:bg-stone-200"
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  order.pickedUp ? "bg-white" : "bg-stone-400"
                                }`}
                              />
                              {order.pickedUp ? "Picked Up" : "Mark Picked Up"}
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEditOrder(order)}
                              className="p-1.5 rounded-lg text-stone-500 hover:text-amber-800 hover:bg-amber-50 transition cursor-pointer"
                              title="Edit Order"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteOrder(order.id)}
                              className="p-1.5 rounded-lg text-stone-500 hover:text-red-700 hover:bg-red-50 transition cursor-pointer"
                              title="Delete Order"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: KITCHEN PREP TALLY */}
        {activeTab === "prep" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(prepTally).map(([category, items]) => (
              <div
                key={category}
                className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm"
              >
                <h3 className="font-bold text-base text-amber-900 border-b border-stone-100 pb-2 mb-3">
                  {category} Needed
                </h3>
                {Object.keys(items).length === 0 ? (
                  <p className="text-xs text-stone-400">No items ordered yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {Object.entries(items).map(([itemName, count]) => (
                      <li
                        key={itemName}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-stone-700 font-medium">
                          {itemName}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 font-bold text-xs">
                          {count} servings
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: MENU & OFFERINGS EDITOR */}
        {activeTab === "menu" && (
          <div className="space-y-6">
            <form
              onSubmit={handleAddMenuItem}
              className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col sm:flex-row gap-3"
            >
              <select
                value={newItemCategory}
                onChange={(e) =>
                  setNewItemCategory(e.target.value as keyof MenuData)
                }
                className="px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white font-medium"
              >
                <option value="meats">Meats</option>
                <option value="sides">Sides</option>
                <option value="breads">Breads</option>
                <option value="desserts">Desserts</option>
                <option value="drinks">Drinks</option>
              </select>
              <input
                type="text"
                placeholder="Add new item..."
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="flex-1 px-3.5 py-2 rounded-lg border border-stone-300 text-sm"
              />
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-amber-800 hover:bg-amber-900 text-white font-semibold text-sm cursor-pointer"
              >
                Add to Menu
              </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(Object.keys(menu) as Array<keyof MenuData>).map((category) => (
                <div
                  key={category}
                  className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm"
                >
                  <h3 className="font-bold text-base capitalize text-stone-900 mb-3">
                    {category}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {menu[category].map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-stone-100 text-stone-800 border border-stone-200"
                      >
                        {item}
                        <button
                          onClick={() => handleRemoveMenuItem(category, item)}
                          className="text-stone-400 hover:text-red-600 font-bold cursor-pointer"
                          title="Remove"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* EDIT SALE INFO MODAL */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-stone-900">
              Edit Event & Payment Info
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  Sale Title
                </label>
                <input
                  type="text"
                  value={saleInfo.title}
                  onChange={(e) =>
                    setSaleInfo({ ...saleInfo, title: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  Date & Hours
                </label>
                <input
                  type="text"
                  value={saleInfo.dateTime}
                  onChange={(e) =>
                    setSaleInfo({ ...saleInfo, dateTime: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  Pickup / Delivery Details
                </label>
                <input
                  type="text"
                  value={saleInfo.location}
                  onChange={(e) =>
                    setSaleInfo({ ...saleInfo, location: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  Payment Info (Cash App, Zelle, etc.)
                </label>
                <input
                  type="text"
                  value={saleInfo.paymentMethods}
                  onChange={(e) =>
                    setSaleInfo({ ...saleInfo, paymentMethods: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  Contact Info
                </label>
                <input
                  type="text"
                  value={saleInfo.contact}
                  onChange={(e) =>
                    setSaleInfo({ ...saleInfo, contact: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-stone-300"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowInfoModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={async () => {
                  await setDoc(doc(db, "settings", "saleInfo"), saleInfo);
                  setShowInfoModal(false);
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-800 text-white hover:bg-amber-900 cursor-pointer"
              >
                Save & Sync Info
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

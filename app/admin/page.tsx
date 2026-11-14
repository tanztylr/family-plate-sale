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
  MapPin,
  AlertCircle,
  Sparkles,
  ArrowLeft,
  ArrowUpDown,
  Ban,
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
type PaymentMethod = "Cash" | "Cash App" | "Zelle";

interface PlateTierOption {
  id: string;
  name: string;
  price: number;
  description: string;
  maxSides: number;
  veggieMaxSides?: number;
  includesExtras: boolean;
}

interface Order {
  id: string;
  name: string;
  tier: string;
  unitPrice?: number;
  tierLabel?: string;
  meat: string;
  extraMeat?: string;
  extraSide?: boolean;
  sides: string[];
  bread: string;
  dessert: string;
  drink: string;
  qty: number;
  notes: string;
  paid: boolean;
  paymentMethod?: PaymentMethod;
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
  soldOut?: string[];
  plateOptions?: PlateTierOption[];
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
const DEFAULT_PLATE_OPTIONS: PlateTierOption[] = [
  {
    id: "full",
    name: "Full Plate",
    price: 15,
    description: "1 Meat, 2 Sides, Bread, Dessert & Drink",
    maxSides: 2,
    includesExtras: true,
  },
  {
    id: "small",
    name: "1-Side / Veggie",
    price: 12,
    description: "1 Meat + 1 Side, OR 3-Side Veggie Plate",
    maxSides: 1,
    veggieMaxSides: 3,
    includesExtras: false,
  },
];

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
  soldOut: [],
  plateOptions: DEFAULT_PLATE_OPTIONS,
};

const INITIAL_SALE_INFO: SaleInfo = {
  title: "LOV Plate Sale",
  dateTime: "",
  location: "Pickup Only",
  contact: "Text or Call to Confirm Orders",
  paymentMethods: "Cash • Cash App • Zelle",
  note: "",
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
  const [tier, setTier] = useState<string>("full");
  const [selectedMeat, setSelectedMeat] = useState("Ham");
  const [hasExtraMeat, setHasExtraMeat] = useState(false);
  const [selectedExtraMeat, setSelectedExtraMeat] = useState("Ham");
  const [hasExtraSide, setHasExtraSide] = useState(false);
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");

  // Menu Editor State
  const [newItemCategory, setNewItemCategory] = useState<
    "meats" | "sides" | "breads" | "drinks" | "desserts"
  >("sides");
  const [newItemName, setNewItemName] = useState("");

  // New Plate Tier Form State
  const [newTierName, setNewTierName] = useState("");
  const [newTierPrice, setNewTierPrice] = useState("");
  const [newTierDesc, setNewTierDesc] = useState("");
  const [newTierSides, setNewTierSides] = useState(1);
  const [newTierExtras, setNewTierExtras] = useState(false);

  useEffect(() => {
    signInAnonymously(auth).catch((err) => console.error("Auth error:", err));
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

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
        const hasPlateOptions =
          data.plateOptions && data.plateOptions.length > 0;
        const needsDrinkSync =
          !data.drinks ||
          data.drinks.length !== allowedDrinks.length ||
          !allowedDrinks.every((d) => data.drinks.includes(d));

        if (needsDrinkSync || !hasChefsChoiceDessert || !hasPlateOptions) {
          const updatedDesserts = hasChefsChoiceDessert
            ? data.desserts
            : ["Chef's Choice", ...(data.desserts || ["Cake Slice", "No Dessert"])];
          const syncedMenu: MenuData = {
            ...data,
            drinks: allowedDrinks,
            desserts: updatedDesserts,
            soldOut: data.soldOut || [],
            plateOptions: hasPlateOptions
              ? data.plateOptions
              : DEFAULT_PLATE_OPTIONS,
          };
          await setDoc(menuDocRef, syncedMenu);
          setMenu(syncedMenu);
        } else {
          setMenu({
            ...data,
            soldOut: data.soldOut || [],
            plateOptions: data.plateOptions || DEFAULT_PLATE_OPTIONS,
          });
        }
      } else {
        await setDoc(menuDocRef, INITIAL_MENU);
      }
    });

    const infoDocRef = doc(db, "settings", "saleInfo");
    const unsubInfo = onSnapshot(infoDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const info = docSnap.data() as SaleInfo;
        const needsLocationUpdate =
          info.location?.toLowerCase().includes("delivery");
        const needsTitleUpdate =
          info.title === "LOV, Plate Sale" || info.title === "Family Plate Sale";
        const needsDateRemoval = info.dateTime?.includes("Saturday");

        if (needsLocationUpdate || needsTitleUpdate || needsDateRemoval) {
          const updatedInfo: SaleInfo = {
            ...info,
            title: needsTitleUpdate ? "LOV Plate Sale" : info.title,
            location: needsLocationUpdate ? "Pickup Only" : info.location,
            dateTime: needsDateRemoval ? "" : info.dateTime,
          };
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

  const plateOptions = menu.plateOptions || DEFAULT_PLATE_OPTIONS;
  const activeTierObj =
    plateOptions.find((p) => p.id === tier) || plateOptions[0];
  const soldOutList = menu.soldOut || [];

  const getMaxSidesForSelection = (
    tierObj: PlateTierOption,
    meatChoice: string,
    extraSideActive: boolean
  ) => {
    const isVeggie = meatChoice.toLowerCase().includes("veggie");
    const baseSides =
      isVeggie && typeof tierObj.veggieMaxSides === "number"
        ? tierObj.veggieMaxSides
        : tierObj.maxSides;
    return baseSides + (extraSideActive ? 1 : 0);
  };

  const addOnCost = (hasExtraMeat ? 1 : 0) + (hasExtraSide ? 1 : 0);
  const unitPrice = (activeTierObj ? activeTierObj.price : 15) + addOnCost;
  const calculatedTotal = unitPrice * qty;

  const getOrderUnitPrice = (o: Order) => {
    if (typeof o.unitPrice === "number") return o.unitPrice;
    const found = plateOptions.find((p) => p.id === o.tier);
    const base = found ? found.price : o.tier === "full" ? 15 : 12;
    return base + (o.extraMeat ? 1 : 0) + (o.extraSide ? 1 : 0);
  };

  const getOrderTierDisplay = (o: Order) => {
    const price = getOrderUnitPrice(o);
    const found = plateOptions.find((p) => p.id === o.tier);
    const label =
      found?.name ||
      o.tierLabel ||
      (o.tier === "full" ? "Full Plate" : "1-Side/Veggie");
    return `${label} ($${price})`;
  };

  const handleToggleSide = (side: string) => {
    if (soldOutList.includes(side)) return;
    const maxSides = getMaxSidesForSelection(
      activeTierObj,
      selectedMeat,
      hasExtraSide
    );

    if (selectedSides.includes(side)) {
      setSelectedSides(selectedSides.filter((s) => s !== side));
    } else if (selectedSides.length >= maxSides) {
      setSelectedSides([...selectedSides.slice(1), side]);
    } else {
      setSelectedSides([...selectedSides, side]);
    }
  };

  const handleTierChange = (newTierId: string) => {
    setTier(newTierId);
    const nextTier =
      plateOptions.find((p) => p.id === newTierId) || plateOptions[0];
    const maxSides = getMaxSidesForSelection(
      nextTier,
      selectedMeat,
      hasExtraSide
    );
    if (selectedSides.length > maxSides) {
      setSelectedSides(selectedSides.slice(0, maxSides));
    }
  };

  const handleToggleExtraMeat = () => {
    const next = !hasExtraMeat;
    setHasExtraMeat(next);
    if (next) {
      const validMeat =
        menu.meats.find(
          (m) => !soldOutList.includes(m) && !m.toLowerCase().includes("none")
        ) ||
        menu.meats[0] ||
        "Ham";
      setSelectedExtraMeat(validMeat);
    }
  };

  const handleToggleExtraSide = () => {
    const next = !hasExtraSide;
    setHasExtraSide(next);
    if (!next) {
      const maxSides = getMaxSidesForSelection(
        activeTierObj,
        selectedMeat,
        false
      );
      if (selectedSides.length > maxSides) {
        setSelectedSides(selectedSides.slice(0, maxSides));
      }
    }
  };

  
const handleSaveOrder = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!customerName.trim()) {
    alert("Please enter a customer name.");
    return;
  }

  if (paid && !paymentMethod) {
    alert("Please select a payment method for this paid order.");
    return;
  }

  try {
    const id = editingOrderId || `order-${Date.now()}`;
    const existing = orders.find((o) => o.id === editingOrderId);

    const paymentMethodToSave: PaymentMethod | undefined =
      paid && paymentMethod ? paymentMethod : undefined;

    const orderPayload: Order = {
      id,
      name: customerName.trim(),
      tier: activeTierObj.id,
      unitPrice,
      tierLabel: activeTierObj.name,
      meat: selectedMeat,
      extraMeat: hasExtraMeat ? selectedExtraMeat : "",
      extraSide: hasExtraSide,
      sides: selectedSides,
      bread: selectedBread,
      dessert: activeTierObj.includesExtras
        ? selectedDessert
        : `Not Included ($${activeTierObj.price} Plate)`,
      drink: activeTierObj.includesExtras
        ? selectedDrink
        : `Not Included ($${activeTierObj.price} Plate)`,
      qty: Math.max(1, qty),
      notes: notes.trim(),
      paid,
      ...(paymentMethodToSave
        ? { paymentMethod: paymentMethodToSave }
        : {}),
      pickedUp: existing ? Boolean(existing.pickedUp) : false,
      incomplete: !selectedMeat || selectedSides.length === 0,
      createdAt: existing ? existing.createdAt : Date.now(),
    };

    console.log("Attempting to save order:", orderPayload);

    await setDoc(doc(db, "orders", id), orderPayload);

    console.log("Order successfully saved:", id);

    alert("Order saved successfully!");
    resetForm();

  } catch (error) {
    console.error("ORDER SAVE FAILED:", error);

    const message =
      error instanceof Error ? error.message : String(error);

    alert(`Unable to save order: ${message}`);
  }
};

  const resetForm = () => {
    setEditingOrderId(null);
    setCustomerName("");
    setTier(plateOptions[0]?.id || "full");
    const defaultMeat =
      menu.meats.find((m) => !soldOutList.includes(m)) || menu.meats[0] || "Ham";
    setSelectedMeat(defaultMeat);
    setHasExtraMeat(false);
    setSelectedExtraMeat(defaultMeat);
    setHasExtraSide(false);
    setSelectedSides(
      menu.sides.filter((s) => !soldOutList.includes(s)).slice(0, 2)
    );
    setSelectedBread(
      menu.breads.find((b) => !soldOutList.includes(b)) || menu.breads[0] || "Roll"
    );
    setSelectedDessert(
      menu.desserts.find((d) => !soldOutList.includes(d)) ||
        menu.desserts[0] ||
        "Chef's Choice"
    );
    setSelectedDrink(
      menu.drinks.find((dr) => !soldOutList.includes(dr)) ||
        menu.drinks[0] ||
        "Bottled Water"
    );
    setQty(1);
    setNotes("");
    setPaid(false);
    setPaymentMethod("");
  };

  const handleEditOrder = (order: Order) => {
    setEditingOrderId(order.id);
    setCustomerName(order.name);
    setTier(
      plateOptions.some((p) => p.id === order.tier)
        ? order.tier
        : plateOptions[0]?.id || "full"
    );
    setSelectedMeat(order.meat || menu.meats[0] || "Ham");
    setHasExtraMeat(Boolean(order.extraMeat));
    setSelectedExtraMeat(order.extraMeat || order.meat || menu.meats[0] || "Ham");
    setHasExtraSide(Boolean(order.extraSide));
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
    setPaymentMethod(order.paymentMethod || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const togglePaid = async (order: Order) => {
    const nextPaid = !Boolean(order.paid);
    await updateDoc(doc(db, "orders", order.id), {
      paid: nextPaid,
      paymentMethod: nextPaid ? order.paymentMethod || "Cash" : null,
    });
  };

  const handleSetPaymentMethod = async (
    order: Order,
    method: PaymentMethod
  ) => {
    await updateDoc(doc(db, "orders", order.id), {
      paid: true,
      paymentMethod: method,
    });
  };

  const togglePickedUp = async (order: Order) => {
    await updateDoc(doc(db, "orders", order.id), {
      pickedUp: !Boolean(order.pickedUp),
    });
  };

  const handleDeleteOrder = async (order: Order) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${order.name}'s order?`
    );
    if (!confirmed) return;

    await deleteDoc(doc(db, "orders", order.id));
    if (editingOrderId === order.id) resetForm();
  };

  // Live Plate Option Editors
  const handleUpdatePlateOption = async (
    optionId: string,
    patch: Partial<PlateTierOption>
  ) => {
    const updatedOptions = plateOptions.map((opt) =>
      opt.id === optionId ? { ...opt, ...patch } : opt
    );
    await setDoc(doc(db, "settings", "menu"), {
      ...menu,
      plateOptions: updatedOptions,
    });
  };

  const handleAddPlateOption = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseFloat(newTierPrice);
    if (!newTierName.trim() || isNaN(parsedPrice)) return;

    const newOption: PlateTierOption = {
      id: `tier-${Date.now()}`,
      name: newTierName.trim(),
      price: parsedPrice,
      description:
        newTierDesc.trim() ||
        `1 Meat, ${newTierSides} Side${newTierSides > 1 ? "s" : ""} & Bread`,
      maxSides: Math.max(0, newTierSides),
      includesExtras: newTierExtras,
    };

    await setDoc(doc(db, "settings", "menu"), {
      ...menu,
      plateOptions: [...plateOptions, newOption],
    });

    setNewTierName("");
    setNewTierPrice("");
    setNewTierDesc("");
    setNewTierSides(1);
    setNewTierExtras(false);
  };

  const handleRemovePlateOption = async (optionId: string) => {
    if (plateOptions.length <= 1) return;
    const updatedOptions = plateOptions.filter((opt) => opt.id !== optionId);
    await setDoc(doc(db, "settings", "menu"), {
      ...menu,
      plateOptions: updatedOptions,
    });
    if (tier === optionId) {
      setTier(updatedOptions[0].id);
    }
  };

  // Menu Item Editors
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
    category: "meats" | "sides" | "breads" | "drinks" | "desserts",
    itemToRemove: string
  ) => {
    const updated: MenuData = {
      ...menu,
      [category]: menu[category].filter((item) => item !== itemToRemove),
      soldOut: (menu.soldOut || []).filter((item) => item !== itemToRemove),
    };
    await setDoc(doc(db, "settings", "menu"), updated);
  };

  const handleToggleSoldOut = async (item: string) => {
    const currentSoldOut = menu.soldOut || [];
    const nextSoldOut = currentSoldOut.includes(item)
      ? currentSoldOut.filter((i) => i !== item)
      : [...currentSoldOut, item];

    await setDoc(doc(db, "settings", "menu"), {
      ...menu,
      soldOut: nextSoldOut,
    });
  };

  // Stats & Payment Breakdown
  const stats = useMemo(() => {
    let totalPlates = 0;
    let totalRevenue = 0;
    let collectedRevenue = 0;
    let cashTotal = 0;
    let cashAppTotal = 0;
    let zelleTotal = 0;
    let pendingPickupPlates = 0;

    let unpaidCount = 0;
    let pendingCount = 0;
    let incompleteCount = 0;
    let completedCount = 0;

    orders.forEach((o) => {
      const price = getOrderUnitPrice(o) * o.qty;
      const isPaid = Boolean(o.paid);
      const isPickedUp = Boolean(o.pickedUp);
      const isInc = isOrderIncomplete(o);

      totalPlates += o.qty;
      totalRevenue += price;
      if (isPaid) {
        collectedRevenue += price;
        const method = o.paymentMethod || "Cash";
        if (method === "Cash App") cashAppTotal += price;
        else if (method === "Zelle") zelleTotal += price;
        else cashTotal += price;
      }
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
      cashTotal,
      cashAppTotal,
      zelleTotal,
      pendingPickupPlates,
      unpaidCount,
      pendingCount,
      incompleteCount,
      completedCount,
    };
  }, [orders, plateOptions]);

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
      if (o.extraMeat && !o.extraMeat.toLowerCase().includes("none")) {
        counts.Meats[o.extraMeat] = (counts.Meats[o.extraMeat] || 0) + o.qty;
      }
      (o.sides || []).forEach((s) => {
        counts.Sides[s] = (counts.Sides[s] || 0) + o.qty;
      });
      if (o.bread && !o.bread.toLowerCase().includes("no bread")) {
        counts.Breads[o.bread] = (counts.Breads[o.bread] || 0) + o.qty;
      }
      if (
        o.dessert &&
        !o.dessert.toLowerCase().includes("no dessert") &&
        !o.dessert.toLowerCase().includes("not included")
      ) {
        counts.Desserts[o.dessert] = (counts.Desserts[o.dessert] || 0) + o.qty;
      }
      if (
        o.drink &&
        !o.drink.toLowerCase().includes("no drink") &&
        !o.drink.toLowerCase().includes("not included")
      ) {
        counts.Drinks[o.drink] = (counts.Drinks[o.drink] || 0) + o.qty;
      }
    });

    return counts;
  }, [orders]);

  const displayedOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = orders.filter((o) => {
      const matchesSearch =
        !query ||
        o.name.toLowerCase().includes(query) ||
        (o.meat || "").toLowerCase().includes(query) ||
        (o.extraMeat || "").toLowerCase().includes(query) ||
        (o.sides || []).join(" ").toLowerCase().includes(query);

      if (!matchesSearch) return false;

      if (filterStatus === "unpaid") return !Boolean(o.paid);
      if (filterStatus === "pending") return !Boolean(o.pickedUp);
      if (filterStatus === "incomplete") return isOrderIncomplete(o);
      if (filterStatus === "completed") return Boolean(o.pickedUp);
      return true;
    });

    return [...filtered].sort((a, b) => {
      const totalA = getOrderUnitPrice(a) * a.qty;
      const totalB = getOrderUnitPrice(b) * b.qty;

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
  }, [orders, searchQuery, filterStatus, sortBy, plateOptions]);

  const handleCopyPromo = () => {
    const available = (items: string[]) =>
      items.filter((i) => !soldOutList.includes(i));

    const pricingLines = plateOptions
      .map((opt) => `• ${opt.name} ($${opt.price}): ${opt.description}`)
      .join("\n");

    const text = `🍽️ ${saleInfo.title.toUpperCase()} 🍽️
📍 ${saleInfo.location}

💲 PRICING:
${pricingLines}
• Add-Ons: Extra Meat (+$1) • Extra Side (+$1)

🍖 MEATS: ${available(menu.meats)
      .filter((m) => !m.includes("None"))
      .join(", ")}
🥗 SIDES: ${available(menu.sides).join(", ")}
🥖 BREAD: ${available(menu.breads)
      .filter((b) => !b.includes("No"))
      .join(", ")}
🍰 DESSERTS: ${available(menu.desserts)
      .filter((d) => !d.includes("No"))
      .join(", ")}
🥤 DRINKS: ${available(menu.drinks)
      .filter((d) => !d.includes("No"))
      .join(", ")}

💵 ${saleInfo.paymentMethods}
📞 ${saleInfo.contact}`;

    navigator.clipboard.writeText(text);
    setCopiedMenu(true);
    setTimeout(() => setCopiedMenu(false), 2500);
  };

  const handleExportCSV = () => {
    const headers = [
      "Name",
      "Plate Option",
      "Meat",
      "Extra Meat (+$1)",
      "Sides",
      "Extra Side (+$1)",
      "Bread",
      "Dessert",
      "Drink",
      "Qty",
      "Total ($)",
      "Paid",
      "Payment Method",
      "Picked Up",
      "Notes",
    ];
    const rows = orders.map((o) => [
      `"${o.name}"`,
      `"${getOrderTierDisplay(o)}"`,
      `"${o.meat}"`,
      `"${o.extraMeat || ""}"`,
      `"${(o.sides || []).join(", ")}"`,
      o.extraSide ? "Yes" : "No",
      `"${o.bread}"`,
      `"${o.dessert}"`,
      `"${o.drink}"`,
      o.qty,
      getOrderUnitPrice(o) * o.qty,
      o.paid ? "Yes" : "No",
      o.paid ? o.paymentMethod || "Cash" : "",
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
      <header className="bg-rose-950 text-rose-50 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Utensils className="w-6 h-6 text-amber-300" />
              <h1 className="text-2xl font-bold tracking-tight">{saleInfo.title}</h1>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-rose-200">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-amber-300" />{" "}
                {saleInfo.location}
              </span>
              <span className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-amber-300" />{" "}
                {saleInfo.paymentMethods}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-900/70 hover:bg-rose-900 text-rose-100 border border-rose-800 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Home
            </Link>
            <button
              onClick={handleCopyPromo}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-900 hover:bg-rose-800 text-rose-100 border border-rose-700 transition cursor-pointer"
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
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-400 text-rose-950 hover:bg-amber-300 transition cursor-pointer"
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
              <Users className="w-4 h-4 text-rose-700" />
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
              <span>Collected</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="mt-1.5 text-2xl font-bold text-emerald-700">
              ${stats.collectedRevenue.toFixed(2)}
            </p>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Cash ${stats.cashTotal} • Cash App ${stats.cashAppTotal} • Zelle $
              {stats.zelleTotal}
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
                  ? "bg-rose-900 text-white shadow-sm"
                  : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
              }`}
            >
              Orders & Calculator
            </button>
            <button
              onClick={() => setActiveTab("prep")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === "prep"
                  ? "bg-rose-900 text-white shadow-sm"
                  : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
              }`}
            >
              <ClipboardList className="w-4 h-4" /> Kitchen Prep Tally
            </button>
            <button
              onClick={() => setActiveTab("menu")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === "menu"
                  ? "bg-rose-900 text-white shadow-sm"
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
                  className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-700"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase text-stone-600">
                    Select Plate Option
                  </label>
                  <button
                    type="button"
                    onClick={() => setActiveTab("menu")}
                    className="text-[11px] font-bold text-rose-800 hover:underline cursor-pointer"
                  >
                    Edit Options →
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {plateOptions.map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => handleTierChange(opt.id)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        tier === opt.id
                          ? "border-rose-800 bg-rose-50/70 ring-2 ring-rose-700/25"
                          : "border-stone-200 hover:bg-stone-50"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-sm text-stone-900">
                        <span>{opt.name}</span>
                        <span className="text-rose-900">${opt.price}</span>
                      </div>
                      <p className="text-[11px] text-stone-500 mt-1 leading-tight">
                        {opt.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* ADD-ONS: + EXTRA MEAT ($1) & + EXTRA SIDE ($1) */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
                  Optional Add-Ons (+$1 Each)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleToggleExtraMeat}
                    className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                      hasExtraMeat
                        ? "bg-red-700 text-white border-red-700 shadow-xs"
                        : "bg-red-50/60 text-red-900 border-red-200 hover:bg-red-100"
                    }`}
                  >
                    <span>
                      {hasExtraMeat ? "✓ Extra Meat" : "+ Extra Meat"}
                    </span>
                    <span>+$1</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleExtraSide}
                    className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                      hasExtraSide
                        ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                        : "bg-emerald-50/60 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
                    }`}
                  >
                    <span>
                      {hasExtraSide ? "✓ Extra Side" : "+ Extra Side"}
                    </span>
                    <span>+$1</span>
                  </button>
                </div>
              </div>

              {/* MEAT (RED) */}
              <div>
                <label className="block text-xs font-bold uppercase text-red-700 mb-1">
                  Meat Choice
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {menu.meats.map((meat) => {
                    const isOut = soldOutList.includes(meat);
                    return (
                      <button
                        type="button"
                        key={meat}
                        disabled={isOut}
                        onClick={() => setSelectedMeat(meat)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                          isOut
                            ? "bg-stone-100 text-stone-400 border-stone-200 line-through cursor-not-allowed"
                            : selectedMeat === meat
                            ? "bg-red-700 text-white border-red-700 shadow-xs cursor-pointer"
                            : "bg-red-50/70 text-red-900 border-red-200 hover:bg-red-100 cursor-pointer"
                        }`}
                      >
                        {meat} {isOut ? "(Sold Out)" : ""}
                      </button>
                    );
                  })}
                </div>

                {hasExtraMeat && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-red-50/70 border border-red-200">
                    <label className="block text-[11px] font-bold uppercase text-red-800 mb-1.5">
                      Select Extra Meat (+$1)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {menu.meats
                        .filter((m) => !m.toLowerCase().includes("none"))
                        .map((meat) => {
                          const isOut = soldOutList.includes(meat);
                          return (
                            <button
                              type="button"
                              key={`extra-${meat}`}
                              disabled={isOut}
                              onClick={() => setSelectedExtraMeat(meat)}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                                isOut
                                  ? "bg-stone-100 text-stone-400 border-stone-200 line-through cursor-not-allowed"
                                  : selectedExtraMeat === meat
                                  ? "bg-red-800 text-white border-red-800 shadow-xs cursor-pointer"
                                  : "bg-white text-red-900 border-red-200 hover:bg-red-100 cursor-pointer"
                              }`}
                            >
                              + {meat} {isOut ? "(Sold Out)" : ""}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* SIDES (GREEN) */}
              <div>
                <label className="block text-xs font-bold uppercase text-emerald-700 mb-1">
                  Sides (Pick up to{" "}
                  {getMaxSidesForSelection(
                    activeTierObj,
                    selectedMeat,
                    hasExtraSide
                  )}
                  {hasExtraSide ? " • Includes +1 Extra Side" : ""})
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {menu.sides.map((side) => {
                    const active = selectedSides.includes(side);
                    const isOut = soldOutList.includes(side);
                    return (
                      <button
                        type="button"
                        key={side}
                        disabled={isOut}
                        onClick={() => handleToggleSide(side)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                          isOut
                            ? "bg-stone-100 text-stone-400 border-stone-200 line-through cursor-not-allowed"
                            : active
                            ? "bg-emerald-700 text-white border-emerald-700 shadow-xs cursor-pointer"
                            : "bg-emerald-50/70 text-emerald-900 border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                        }`}
                      >
                        {isOut ? `${side} (Sold Out)` : active ? `✓ ${side}` : side}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* BREAD (ORANGE), DRINK (BLUE), DESSERT (PURPLE) */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-orange-700 mb-1">
                    Bread
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {menu.breads.map((b) => {
                      const isOut = soldOutList.includes(b);
                      return (
                        <button
                          type="button"
                          key={b}
                          disabled={isOut}
                          onClick={() => setSelectedBread(b)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                            isOut
                              ? "bg-stone-100 text-stone-400 border-stone-200 line-through cursor-not-allowed"
                              : selectedBread === b
                              ? "bg-orange-600 text-white border-orange-600 shadow-xs cursor-pointer"
                              : "bg-orange-50/70 text-orange-900 border-orange-200 hover:bg-orange-100 cursor-pointer"
                          }`}
                        >
                          {b} {isOut ? "(Sold Out)" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeTierObj.includesExtras && (
                  <>
                    <div>
                      <label className="block text-xs font-bold uppercase text-blue-700 mb-1">
                        Drink
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {menu.drinks.map((dr) => {
                          const isOut = soldOutList.includes(dr);
                          return (
                            <button
                              type="button"
                              key={dr}
                              disabled={isOut}
                              onClick={() => setSelectedDrink(dr)}
                              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                                isOut
                                  ? "bg-stone-100 text-stone-400 border-stone-200 line-through cursor-not-allowed"
                                  : selectedDrink === dr
                                  ? "bg-blue-700 text-white border-blue-700 shadow-xs cursor-pointer"
                                  : "bg-blue-50/70 text-blue-900 border-blue-200 hover:bg-blue-100 cursor-pointer"
                              }`}
                            >
                              {dr} {isOut ? "(Sold Out)" : ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-purple-700 mb-1">
                        Dessert
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {menu.desserts.map((d) => {
                          const isOut = soldOutList.includes(d);
                          return (
                            <button
                              type="button"
                              key={d}
                              disabled={isOut}
                              onClick={() => setSelectedDessert(d)}
                              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                                isOut
                                  ? "bg-stone-100 text-stone-400 border-stone-200 line-through cursor-not-allowed"
                                  : selectedDessert === d
                                  ? "bg-purple-700 text-white border-purple-700 shadow-xs cursor-pointer"
                                  : "bg-purple-50/70 text-purple-900 border-purple-200 hover:bg-purple-100 cursor-pointer"
                              }`}
                            >
                              {d} {isOut ? "(Sold Out)" : ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Quantity & Total */}
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
                    {addOnCost > 0 ? ` (incl. +$${addOnCost} add-ons)` : ""}
                  </span>
                  <span className="text-2xl font-extrabold text-amber-950">
                    ${calculatedTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Notes & Payment Tagging */}
              <div className="space-y-2.5">
                <input
                  type="text"
                  placeholder="Optional notes (e.g., extra gravy, 2pm pickup)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={paid}
                      onChange={(e) => setPaid(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    Already Paid
                  </label>

                  {paid && (
                    <div className="flex items-center gap-1">
                      {(["Cash", "Cash App", "Zelle"] as PaymentMethod[]).map(
                        (method) => (
                          <button
                            type="button"
                            key={method}
                            onClick={() => setPaymentMethod(method)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                              paymentMethod === method
                                ? "bg-emerald-600 text-white"
                                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                            }`}
                          >
                            {method}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-rose-900 hover:bg-rose-950 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {editingOrderId
                  ? "Update Order"
                  : `Save Order ($${calculatedTotal})`}
              </button>
            </form>

            {/* RIGHT: LIVE ORDER LIST */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search name, meat, or side..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-700"
                    />
                  </div>

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
                      className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs font-semibold bg-stone-50 text-stone-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-700"
                    >
                      <option value="oldest">Order Added (First → Last)</option>
                      <option value="newest">Newest First</option>
                      <option value="alpha">Alphabetical (A → Z)</option>
                      <option value="highest">Highest Total ($ → $)</option>
                      <option value="lowest">Lowest Total ($ → $)</option>
                    </select>
                  </div>
                </div>

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

              {loading ? (
                <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center text-sm text-stone-500">
                  Loading orders...
                </div>
              ) : displayedOrders.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center text-sm text-stone-500">
                  No orders in this tab right now.
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedOrders.map((order) => {
                    const orderTotal = getOrderUnitPrice(order) * order.qty;
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
                              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-950">
                                {order.qty}x {getOrderTierDisplay(order)}
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
                                {order.extraMeat && (
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-200 text-red-950 border border-red-300">
                                    + Extra: {order.extraMeat} (+$1)
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
                                {order.extraSide && (
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-200 text-emerald-950 border border-emerald-300">
                                    +1 Extra Side (+$1)
                                  </span>
                                )}
                                {order.bread && (
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-900">
                                    {order.bread}
                                  </span>
                                )}
                                {order.drink &&
                                  !order.drink.includes("Not Included") && (
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-900">
                                      {order.drink}
                                    </span>
                                  )}
                                {order.dessert &&
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

                        <div className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
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
                              {order.paid
                                ? `Paid (${order.paymentMethod || "Cash"})`
                                : "Mark Paid"}
                            </button>

                            {(
                              ["Cash", "Cash App", "Zelle"] as PaymentMethod[]
                            ).map((method) => {
                              const activeMethod =
                                order.paid &&
                                (order.paymentMethod || "Cash") === method;
                              return (
                                <button
                                  type="button"
                                  key={method}
                                  onClick={() =>
                                    handleSetPaymentMethod(order, method)
                                  }
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                                    activeMethod
                                      ? "bg-emerald-100 text-emerald-900 border border-emerald-400"
                                      : "bg-stone-50 text-stone-500 border border-stone-200 hover:bg-stone-100"
                                  }`}
                                >
                                  {method}
                                </button>
                              );
                            })}

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
                              className="p-1.5 rounded-lg text-stone-500 hover:text-rose-900 hover:bg-rose-50 transition cursor-pointer"
                              title="Edit Order"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteOrder(order)}
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
                <h3 className="font-bold text-base text-rose-950 border-b border-stone-100 pb-2 mb-3">
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
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-950 font-bold text-xs">
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

        {/* TAB 3: MENU & PLATE OPTIONS EDITOR */}
        {activeTab === "menu" && (
          <div className="space-y-6">
            {/* LIVE PLATE OPTIONS & PRICING EDITOR */}
            <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm space-y-4">
              <div>
                <h3 className="font-bold text-base text-rose-950">
                  Plate Options & Pricing
                </h3>
                <p className="text-xs text-stone-500">
                  Edit plate names, prices, side limits, or add new plate tiers
                  on the spot.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {plateOptions.map((opt) => (
                  <div
                    key={opt.id}
                    className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/70 space-y-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt.name}
                        onChange={(e) =>
                          handleUpdatePlateOption(opt.id, {
                            name: e.target.value,
                          })
                        }
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-sm font-bold"
                        placeholder="Plate Name"
                      />
                      <div className="flex items-center bg-white border border-stone-300 rounded-lg px-2">
                        <span className="text-xs font-bold text-stone-500">
                          $
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={opt.price}
                          onChange={(e) =>
                            handleUpdatePlateOption(opt.id, {
                              price: Math.max(
                                0,
                                parseFloat(e.target.value) || 0
                              ),
                            })
                          }
                          className="w-14 py-1.5 pl-1 text-sm font-extrabold text-rose-950 focus:outline-none"
                        />
                      </div>
                      {plateOptions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePlateOption(opt.id)}
                          className="p-1.5 text-stone-400 hover:text-red-700 cursor-pointer"
                          title="Remove Plate Option"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      value={opt.description}
                      onChange={(e) =>
                        handleUpdatePlateOption(opt.id, {
                          description: e.target.value,
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-xs text-stone-700"
                      placeholder="What is included..."
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
                      <label className="inline-flex items-center gap-1.5 font-medium">
                        Max Sides:
                        <input
                          type="number"
                          min={0}
                          max={6}
                          value={opt.maxSides}
                          onChange={(e) =>
                            handleUpdatePlateOption(opt.id, {
                              maxSides: Math.max(
                                0,
                                parseInt(e.target.value) || 0
                              ),
                            })
                          }
                          className="w-12 px-1.5 py-0.5 rounded border border-stone-300 bg-white font-bold text-center"
                        />
                      </label>

                      <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={opt.includesExtras}
                          onChange={(e) =>
                            handleUpdatePlateOption(opt.id, {
                              includesExtras: e.target.checked,
                            })
                          }
                          className="rounded text-rose-800"
                        />
                        Includes Drink & Dessert
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Plate Option */}
              <form
                onSubmit={handleAddPlateOption}
                className="pt-2 border-t border-stone-100 flex flex-col sm:flex-row flex-wrap gap-2"
              >
                <input
                  type="text"
                  placeholder="New plate name (e.g., Kid's Plate)"
                  value={newTierName}
                  onChange={(e) => setNewTierName(e.target.value)}
                  className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-stone-300 text-xs"
                />
                <input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="Price ($)"
                  value={newTierPrice}
                  onChange={(e) => setNewTierPrice(e.target.value)}
                  className="w-24 px-3 py-1.5 rounded-lg border border-stone-300 text-xs"
                />
                <input
                  type="text"
                  placeholder="Description (e.g., 1 Meat, 1 Side & Drink)"
                  value={newTierDesc}
                  onChange={(e) => setNewTierDesc(e.target.value)}
                  className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-stone-300 text-xs"
                />
                <label className="inline-flex items-center gap-1 px-2 text-xs text-stone-600">
                  Sides:
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={newTierSides}
                    onChange={(e) =>
                      setNewTierSides(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-11 px-1.5 py-1 rounded border border-stone-300 text-xs text-center"
                  />
                </label>
                <label className="inline-flex items-center gap-1.5 px-2 text-xs text-stone-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newTierExtras}
                    onChange={(e) => setNewTierExtras(e.target.checked)}
                  />
                  Drink & Dessert
                </label>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-rose-900 hover:bg-rose-950 text-white text-xs font-bold cursor-pointer"
                >
                  + Add Plate Option
                </button>
              </form>
            </div>

            {/* ADD FOOD / DRINK ITEM */}
            <form
              onSubmit={handleAddMenuItem}
              className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col sm:flex-row gap-3"
            >
              <select
                value={newItemCategory}
                onChange={(e) =>
                  setNewItemCategory(
                    e.target.value as
                      | "meats"
                      | "sides"
                      | "breads"
                      | "drinks"
                      | "desserts"
                  )
                }
                className="px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white font-medium"
              >
                <option value="meats">Meats (Red)</option>
                <option value="sides">Sides (Green)</option>
                <option value="breads">Breads (Orange)</option>
                <option value="drinks">Drinks (Blue)</option>
                <option value="desserts">Desserts (Purple)</option>
              </select>
              <input
                type="text"
                placeholder="Add new food or drink item..."
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="flex-1 px-3.5 py-2 rounded-lg border border-stone-300 text-sm"
              />
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-rose-900 hover:bg-rose-950 text-white font-semibold text-sm cursor-pointer"
              >
                Add to Menu
              </button>
            </form>

            {/* COLOR-CODED MENU CARDS WITH SOLD-OUT TOGGLES */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(
                [
                  {
                    key: "meats",
                    label: "Meats",
                    card: "border-red-200 bg-red-50/30",
                    heading: "text-red-800",
                    pill: "bg-red-100 text-red-900 border-red-200",
                    close: "text-red-500 hover:text-red-800",
                  },
                  {
                    key: "sides",
                    label: "Sides",
                    card: "border-emerald-200 bg-emerald-50/30",
                    heading: "text-emerald-800",
                    pill: "bg-emerald-100 text-emerald-900 border-emerald-200",
                    close: "text-emerald-600 hover:text-emerald-900",
                  },
                  {
                    key: "breads",
                    label: "Breads",
                    card: "border-orange-200 bg-orange-50/30",
                    heading: "text-orange-800",
                    pill: "bg-orange-100 text-orange-900 border-orange-200",
                    close: "text-orange-500 hover:text-orange-800",
                  },
                  {
                    key: "drinks",
                    label: "Drinks",
                    card: "border-blue-200 bg-blue-50/30",
                    heading: "text-blue-800",
                    pill: "bg-blue-100 text-blue-900 border-blue-200",
                    close: "text-blue-500 hover:text-blue-800",
                  },
                  {
                    key: "desserts",
                    label: "Desserts",
                    card: "border-purple-200 bg-purple-50/30",
                    heading: "text-purple-800",
                    pill: "bg-purple-100 text-purple-900 border-purple-200",
                    close: "text-purple-500 hover:text-purple-800",
                  },
                ] as const
              ).map(({ key, label, card, heading, pill, close }) => (
                <div
                  key={key}
                  className={`p-5 rounded-2xl border shadow-sm ${card}`}
                >
                  <h3 className={`font-bold text-base mb-3 ${heading}`}>
                    {label}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {menu[key].map((item) => {
                      const isOut = soldOutList.includes(item);
                      return (
                        <span
                          key={item}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                            isOut
                              ? "bg-stone-200 text-stone-600 border-stone-300"
                              : pill
                          }`}
                        >
                          <span className={isOut ? "line-through" : ""}>
                            {item}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleSoldOut(item)}
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer ${
                              isOut
                                ? "bg-rose-600 text-white"
                                : "bg-white/80 text-stone-700 hover:bg-white"
                            }`}
                            title={
                              isOut ? "Mark Back in Stock" : "Mark Sold Out"
                            }
                          >
                            <Ban className="w-2.5 h-2.5" />
                            {isOut ? "Sold Out" : "In Stock"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveMenuItem(key, item)}
                            className={`font-bold cursor-pointer ${close}`}
                            title="Delete Item"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
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
                  Pickup Details
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
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-900 text-white hover:bg-rose-950 cursor-pointer"
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

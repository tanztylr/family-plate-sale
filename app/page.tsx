"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";
import {
  Utensils,
  Calendar,
  MapPin,
  Phone,
  CheckCircle2,
  Sparkles,
  Lock,
  ShoppingBag,
  Plus,
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

const DEFAULT_MENU: MenuData = {
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
  desserts: ["Cake Slice", "No Dessert"],
  drinks: ["Bottled Water", "Soda", "No Drink"],
};

const DEFAULT_SALE_INFO: SaleInfo = {
  title: "LOV, Plate Sale",
  dateTime: "Saturday • Starting at 12:00 PM until Sold Out",
  location: "Pickup & Local Delivery Available",
  contact: "Text or Call to Confirm Orders",
  paymentMethods: "Cash • Cash App • Zelle",
  note: "Full Plate ($15): 1 Meat, 2 Sides, Bread, Dessert & Drink | 1-Side or Veggie Plate ($12)",
};

export default function PlateSaleHomepage() {
  const [user, setUser] = useState<User | null>(null);
  const [menu, setMenu] = useState<MenuData>(DEFAULT_MENU);
  const [saleInfo, setSaleInfo] = useState<SaleInfo>(DEFAULT_SALE_INFO);

  // Customer Order Form State
  const [customerName, setCustomerName] = useState("");
  const [phoneOrContact, setPhoneOrContact] = useState("");
  const [tier, setTier] = useState<"full" | "small">("full");
  const [selectedMeat, setSelectedMeat] = useState("Baked Turkey Wings");
  const [selectedSides, setSelectedSides] = useState<string[]>([
    "Dressing",
    "Baked Mac n Cheese",
  ]);
  const [selectedBread, setSelectedBread] = useState("Roll");
  const [selectedDessert, setSelectedDessert] = useState("Cake Slice");
  const [selectedDrink, setSelectedDrink] = useState("Bottled Water");
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderSubmitted, setOrderSubmitted] = useState<{
    name: string;
    total: number;
    qty: number;
    tier: "full" | "small";
  } | null>(null);

  useEffect(() => {
    signInAnonymously(auth).catch((err) => console.error("Auth error:", err));
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubMenu = onSnapshot(doc(db, "settings", "menu"), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as MenuData;
        setMenu({
          ...data,
          drinks: ["Bottled Water", "Soda", "No Drink"],
        });
      }
    });

    const unsubInfo = onSnapshot(doc(db, "settings", "saleInfo"), (snap) => {
      if (snap.exists()) {
        setSaleInfo(snap.data() as SaleInfo);
      }
    });

    return () => {
      unsubMenu();
      unsubInfo();
    };
  }, [user]);

  const unitPrice = tier === "full" ? 15 : 12;
  const totalAmount = unitPrice * qty;
  const isVeggie = selectedMeat.toLowerCase().includes("veggie");
  const maxSides = tier === "full" ? 2 : isVeggie ? 3 : 1;

  const handleToggleSide = (side: string) => {
    if (selectedSides.includes(side)) {
      setSelectedSides(selectedSides.filter((s) => s !== side));
    } else if (selectedSides.length >= maxSides) {
      setSelectedSides([...selectedSides.slice(1), side]);
    } else {
      setSelectedSides([...selectedSides, side]);
    }
  };

  const handleTierSwitch = (newTier: "full" | "small") => {
    setTier(newTier);
    if (newTier === "small" && !isVeggie && selectedSides.length > 1) {
      setSelectedSides(selectedSides.slice(0, 1));
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || submitting) return;

    setSubmitting(true);
    try {
      const id = `order-${Date.now()}`;
      const combinedNotes = [
        phoneOrContact.trim() ? `Contact: ${phoneOrContact.trim()}` : "",
        notes.trim(),
      ]
        .filter(Boolean)
        .join(" | ");

      await setDoc(doc(db, "orders", id), {
        id,
        name: customerName.trim(),
        tier,
        meat: selectedMeat,
        sides: selectedSides,
        bread: selectedBread,
        dessert: tier === "full" ? selectedDessert : "Not Included ($12 Plate)",
        drink: tier === "full" ? selectedDrink : "Not Included ($12 Plate)",
        qty: Math.max(1, qty),
        notes: combinedNotes,
        paid: false,
        pickedUp: false,
        incomplete: !selectedMeat || selectedSides.length === 0,
        createdAt: Date.now(),
      });

      setOrderSubmitted({
        name: customerName.trim(),
        total: totalAmount,
        qty,
        tier,
      });
    } catch (err) {
      console.error("Order failed:", err);
      alert("Something went wrong submitting your order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForAnotherOrder = () => {
    setOrderSubmitted(null);
    setCustomerName("");
    setPhoneOrContact("");
    setQty(1);
    setNotes("");
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-20">
      {/* TOP NAVIGATION BAR */}
      <nav className="bg-amber-950 text-amber-100 border-b border-amber-900/60">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm tracking-wide">
            <Utensils className="w-4 h-4 text-amber-400" />
            <span>{saleInfo.title}</span>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-900/80 hover:bg-amber-800 text-amber-200 border border-amber-700/50 transition"
          >
            <Lock className="w-3.5 h-3.5" /> Kitchen & Admin
          </Link>
        </div>
      </nav>

      {/* HERO SECTION */}
      <header className="bg-gradient-to-br from-amber-900 via-amber-800 to-stone-900 text-amber-50">
        <div className="max-w-5xl mx-auto px-4 py-14 sm:py-16 text-center space-y-5">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-200 border border-amber-500/30">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Homemade Soul
            Food • Pre-Orders Open
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            {saleInfo.title}
          </h1>

          <p className="max-w-2xl mx-auto text-sm sm:text-base text-amber-100/90 leading-relaxed">
            Reserve your plates ahead of time for quick pickup or local
            delivery. Every plate is packed fresh to order!
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm text-amber-100">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur-sm">
              <Calendar className="w-4 h-4 text-amber-300" /> {saleInfo.dateTime}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur-sm">
              <MapPin className="w-4 h-4 text-amber-300" /> {saleInfo.location}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur-sm">
              <Phone className="w-4 h-4 text-amber-300" />{" "}
              {saleInfo.paymentMethods}
            </span>
          </div>

          <div className="pt-3">
            <a
              href="#order-form"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-extrabold text-sm shadow-lg transition"
            >
              <ShoppingBag className="w-4 h-4" /> Reserve Your Plate Now
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 -mt-6 space-y-10">
        {/* PRICING TIERS */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-2xl border-2 border-amber-600/40 shadow-md flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                  Most Popular
                </span>
                <span className="text-3xl font-extrabold text-amber-900">
                  $15
                </span>
              </div>
              <h2 className="mt-3 text-xl font-bold text-stone-900">
                Full Dinner Plate
              </h2>
              <p className="mt-1.5 text-sm text-stone-600">
                Includes{" "}
                <span className="font-semibold text-red-700">1 Meat</span>,{" "}
                <span className="font-semibold text-emerald-700">2 Sides</span>,{" "}
                <span className="font-semibold text-orange-700">Bread</span>,{" "}
                <span className="font-semibold text-stone-800">Dessert</span>,
                and a{" "}
                <span className="font-semibold text-blue-700">Drink</span>.
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-md flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-stone-100 text-stone-700">
                  Lighter or Veggie Option
                </span>
                <span className="text-3xl font-extrabold text-stone-900">
                  $12
                </span>
              </div>
              <h2 className="mt-3 text-xl font-bold text-stone-900">
                1-Side or Veggie Plate
              </h2>
              <p className="mt-1.5 text-sm text-stone-600">
                Choose{" "}
                <span className="font-semibold text-red-700">1 Meat</span> +{" "}
                <span className="font-semibold text-emerald-700">1 Side</span> +{" "}
                <span className="font-semibold text-orange-700">Bread</span>, OR
                make it a{" "}
                <span className="font-semibold text-emerald-700">
                  3-Side Veggie Plate
                </span>{" "}
                + <span className="font-semibold text-orange-700">Bread</span>.
              </p>
            </div>
          </div>
        </section>

        {/* TODAY'S LIVE MENU */}
        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-sm space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-extrabold text-stone-900">
              Today's Menu Lineup
            </h2>
            <p className="text-xs sm:text-sm text-stone-500 mt-1">
              Updated live from our kitchen — build your plate below
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-700 border-b border-red-200 pb-2 mb-3">
                Meats
              </h3>
              <ul className="space-y-1.5 text-sm font-medium text-stone-800">
                {menu.meats
                  .filter((m) => !m.toLowerCase().includes("none"))
                  .map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 border-b border-emerald-200 pb-2 mb-3">
                Homemade Sides
              </h3>
              <ul className="space-y-1.5 text-sm font-medium text-stone-800">
                {menu.sides.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-700 border-b border-orange-200 pb-2 mb-3">
                Bread & Desserts
              </h3>
              <ul className="space-y-1.5 text-sm font-medium text-stone-800">
                {menu.breads
                  .filter((b) => !b.toLowerCase().includes("no "))
                  .map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                {menu.desserts
                  .filter((d) => !d.toLowerCase().includes("no "))
                  .map((item) => (
                    <li key={item}>• {item} (Full Plate)</li>
                  ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 border-b border-blue-200 pb-2 mb-3">
                Drinks (Full Plate)
              </h3>
              <ul className="space-y-1.5 text-sm font-medium text-stone-800">
                {menu.drinks
                  .filter((d) => !d.toLowerCase().includes("no "))
                  .map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
              </ul>
            </div>
          </div>
        </section>

        {/* CUSTOMER SELF-ORDER FORM */}
        <section id="order-form" className="max-w-2xl mx-auto">
          {orderSubmitted ? (
            <div className="bg-white p-8 rounded-2xl border-2 border-emerald-500 shadow-md text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h2 className="text-2xl font-extrabold text-stone-900">
                Order Received, {orderSubmitted.name}!
              </h2>
              <p className="text-sm text-stone-600">
                We've added your{" "}
                <span className="font-bold text-stone-900">
                  {orderSubmitted.qty}x{" "}
                  {orderSubmitted.tier === "full"
                    ? "Full Plate"
                    : "1-Side / Veggie Plate"}
                </span>{" "}
                (${orderSubmitted.total.toFixed(2)}) straight to our kitchen
                board.
              </p>
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-950 space-y-1">
                <p className="font-bold">Payment & Pickup Details:</p>
                <p>{saleInfo.paymentMethods}</p>
                <p>{saleInfo.contact}</p>
              </div>
              <button
                onClick={resetForAnotherOrder}
                className="px-5 py-2.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white font-bold text-sm transition cursor-pointer"
              >
                Place Another Order
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmitOrder}
              className="bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-md space-y-5"
            >
              <div>
                <h2 className="text-2xl font-extrabold text-stone-900">
                  Place Your Plate Order
                </h2>
                <p className="text-xs sm:text-sm text-stone-500 mt-1">
                  Customize your plate below and it will sync directly to our
                  prep list.
                </p>
              </div>

              {/* Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-stone-600 mb-1">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="First & Last Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-stone-600 mb-1">
                    Phone / Text Number (Optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={phoneOrContact}
                    onChange={(e) => setPhoneOrContact(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
                  />
                </div>
              </div>

              {/* Plate Tier */}
              <div>
                <label className="block text-xs font-bold uppercase text-stone-600 mb-1.5">
                  1. Choose Plate Size
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleTierSwitch("full")}
                    className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                      tier === "full"
                        ? "border-amber-700 bg-amber-50 ring-2 ring-amber-600/30"
                        : "border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-sm">
                      <span>Full Plate</span>
                      <span className="text-amber-800">$15</span>
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1">
                      1 Meat, 2 Sides, Bread, Dessert & Drink
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTierSwitch("small")}
                    className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                      tier === "small"
                        ? "border-amber-700 bg-amber-50 ring-2 ring-amber-600/30"
                        : "border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-sm">
                      <span>1-Side / Veggie</span>
                      <span className="text-amber-800">$12</span>
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1">
                      1 Meat + 1 Side, OR 3-Side Veggie Plate
                    </p>
                  </button>
                </div>
              </div>

              {/* COLOR-CODED MEAT (RED) */}
              <div>
                <label className="block text-xs font-bold uppercase text-red-700 mb-1.5">
                  2. Select Your Meat
                </label>
                <div className="flex flex-wrap gap-2">
                  {menu.meats.map((meat) => (
                    <button
                      type="button"
                      key={meat}
                      onClick={() => setSelectedMeat(meat)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        selectedMeat === meat
                          ? "bg-red-700 text-white border-red-700"
                          : "bg-red-50/70 text-red-900 border-red-200 hover:bg-red-100"
                      }`}
                    >
                      {meat}
                    </button>
                  ))}
                </div>
              </div>

              {/* COLOR-CODED SIDES (GREEN) */}
              <div>
                <label className="block text-xs font-bold uppercase text-emerald-700 mb-1.5">
                  3. Pick Your Sides (Up to {maxSides})
                </label>
                <div className="flex flex-wrap gap-2">
                  {menu.sides.map((side) => {
                    const active = selectedSides.includes(side);
                    return (
                      <button
                        type="button"
                        key={side}
                        onClick={() => handleToggleSide(side)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                          active
                            ? "bg-emerald-700 text-white border-emerald-700"
                            : "bg-emerald-50/70 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
                        }`}
                      >
                        {active ? `✓ ${side}` : side}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* COLOR-CODED BREAD (ORANGE) */}
              <div>
                <label className="block text-xs font-bold uppercase text-orange-700 mb-1.5">
                  4. Bread Choice
                </label>
                <div className="flex flex-wrap gap-2">
                  {menu.breads.map((b) => (
                    <button
                      type="button"
                      key={b}
                      onClick={() => setSelectedBread(b)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        selectedBread === b
                          ? "bg-orange-600 text-white border-orange-600"
                          : "bg-orange-50/70 text-orange-900 border-orange-200 hover:bg-orange-100"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* COLOR-CODED DRINK (BLUE) & DESSERT */}
              {tier === "full" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-blue-700 mb-1.5">
                      5. Drink Choice
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {menu.drinks.map((dr) => (
                        <button
                          type="button"
                          key={dr}
                          onClick={() => setSelectedDrink(dr)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                            selectedDrink === dr
                              ? "bg-blue-700 text-white border-blue-700"
                              : "bg-blue-50/70 text-blue-900 border-blue-200 hover:bg-blue-100"
                          }`}
                        >
                          {dr}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-stone-600 mb-1">
                      6. Dessert
                    </label>
                    <select
                      value={selectedDessert}
                      onChange={(e) => setSelectedDessert(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-xs bg-white"
                    >
                      {menu.desserts.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Quantity & Total */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold uppercase text-amber-950 mb-1">
                    How Many Plates?
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQty(Math.max(1, qty - 1))}
                      className="w-8 h-8 rounded-lg bg-white border border-amber-300 font-bold text-amber-900 cursor-pointer"
                    >
                      -
                    </button>
                    <span className="w-10 text-center font-bold text-base">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty(qty + 1)}
                      className="w-8 h-8 rounded-lg bg-white border border-amber-300 font-bold text-amber-900 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-amber-800 block">
                    Order Total
                  </span>
                  <span className="text-2xl font-extrabold text-amber-950">
                    ${totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold uppercase text-stone-600 mb-1">
                  Pickup Time or Special Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Picking up around 2:00 PM, paying via Cash App..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {submitting
                  ? "Submitting Order..."
                  : `Submit Order ($${totalAmount.toFixed(2)})`}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

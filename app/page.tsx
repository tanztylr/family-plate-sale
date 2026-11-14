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
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import {
  Utensils,
  MapPin,
  DollarSign,
  ClipboardList,
  ArrowRight,
  Users,
  Clock,
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
  tier: "full" | "small";
  qty: number;
  paid: boolean;
  pickedUp: boolean;
}

interface MenuData {
  meats: string[];
  sides: string[];
  breads: string[];
  desserts: string[];
  drinks: string[];
  soldOut?: string[];
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
  desserts: ["Chef's Choice", "Cake Slice", "No Dessert"],
  drinks: ["Bottled Water", "Soda", "No Drink"],
  soldOut: [],
};

const DEFAULT_SALE_INFO: SaleInfo = {
  title: "LOV Plate Sale",
  dateTime: "",
  location: "Pickup Only",
  contact: "Text or Call to Confirm Orders",
  paymentMethods: "Cash • Cash App • Zelle",
  note: "Full Plate ($15): 1 Meat, 2 Sides, Bread, Dessert & Drink | 1-Side or Veggie Plate ($12)",
};

export default function TeamPlateSaleHome() {
  const [user, setUser] = useState<User | null>(null);
  const [menu, setMenu] = useState<MenuData>(DEFAULT_MENU);
  const [saleInfo, setSaleInfo] = useState<SaleInfo>(DEFAULT_SALE_INFO);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    signInAnonymously(auth).catch((err) => console.error("Auth error:", err));
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubOrders = onSnapshot(collection(db, "orders"), (snap) => {
      const list: Order[] = [];
      snap.forEach((d) => list.push(d.data() as Order));
      setOrders(list);
    });

    const unsubMenu = onSnapshot(doc(db, "settings", "menu"), (snap) => {
      if (snap.exists()) {
        setMenu(snap.data() as MenuData);
      }
    });

    const unsubInfo = onSnapshot(doc(db, "settings", "saleInfo"), async (snap) => {
      if (snap.exists()) {
        const info = snap.data() as SaleInfo;
        const needsLocationUpdate = info.location?.toLowerCase().includes("delivery");
        const needsTitleUpdate =
          info.title === "LOV, Plate Sale" || info.title === "Family Plate Sale";
        const needsDateRemoval = info.dateTime?.includes("Saturday");

        if (needsLocationUpdate || needsTitleUpdate || needsDateRemoval) {
          const updated: SaleInfo = {
            ...info,
            title: needsTitleUpdate ? "LOV Plate Sale" : info.title,
            location: needsLocationUpdate ? "Pickup Only" : info.location,
            dateTime: needsDateRemoval ? "" : info.dateTime,
          };
          await setDoc(doc(db, "settings", "saleInfo"), updated);
          setSaleInfo(updated);
        } else {
          setSaleInfo(info);
        }
      }
    });

    return () => {
      unsubOrders();
      unsubMenu();
      unsubInfo();
    };
  }, [user]);

  const totalPlates = orders.reduce((acc, o) => acc + (o.qty || 1), 0);
  const toPackCount = orders.reduce(
    (acc, o) => (!o.pickedUp ? acc + (o.qty || 1) : acc),
    0
  );
  const totalExpected = orders.reduce(
    (acc, o) => acc + (o.tier === "full" ? 15 : 12) * (o.qty || 1),
    0
  );
  const soldOutList = menu.soldOut || [];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-16">
      {/* TOP BAR */}
      <nav className="bg-amber-950 text-amber-100 border-b border-amber-900/60">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm tracking-wide">
            <Utensils className="w-4 h-4 text-amber-400" />
            <span>{saleInfo.title}</span>
          </div>

          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-300 text-amber-950 transition"
          >
            <ClipboardList className="w-3.5 h-3.5" /> Open Order Tracker
          </Link>
        </div>
      </nav>

      {/* COMPACT HERO */}
      <header className="bg-gradient-to-br from-amber-900 via-amber-800 to-stone-900 text-amber-50">
        <div className="max-w-5xl mx-auto px-4 py-10 sm:py-12 text-center space-y-4">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            {saleInfo.title}
          </h1>

          <div className="pt-1 flex flex-wrap items-center justify-center gap-2.5 text-xs sm:text-sm text-amber-100">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10">
              <MapPin className="w-4 h-4 text-amber-300" /> {saleInfo.location}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10">
              <DollarSign className="w-4 h-4 text-amber-300" />{" "}
              {saleInfo.paymentMethods}
            </span>
          </div>

          <div className="pt-2">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-extrabold text-sm shadow-md transition"
            >
              Manage Orders, Prep Tally & Menu <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 -mt-5 space-y-6">
        {/* SNAPSHOT CARDS */}
        <section className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm text-center">
            <div className="flex items-center justify-center gap-1 text-xs font-semibold uppercase text-stone-500">
              <Users className="w-3.5 h-3.5 text-amber-600" /> Total Plates
            </div>
            <p className="mt-1 text-2xl font-extrabold text-stone-900">
              {totalPlates}
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm text-center">
            <div className="flex items-center justify-center gap-1 text-xs font-semibold uppercase text-stone-500">
              <Clock className="w-3.5 h-3.5 text-amber-600" /> To Pack
            </div>
            <p className="mt-1 text-2xl font-extrabold text-amber-700">
              {toPackCount}
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm text-center">
            <div className="flex items-center justify-center gap-1 text-xs font-semibold uppercase text-stone-500">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Expected
            </div>
            <p className="mt-1 text-2xl font-extrabold text-emerald-700">
              ${totalExpected.toFixed(2)}
            </p>
          </div>
        </section>

        {/* PLATE PRICING REFERENCE */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border-2 border-amber-600/30 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-stone-900">
                Full Dinner Plate
              </h2>
              <span className="text-2xl font-extrabold text-amber-900">$15</span>
            </div>
            <p className="mt-1.5 text-sm text-stone-600">
              Includes{" "}
              <span className="font-semibold text-red-700">1 Meat</span>,{" "}
              <span className="font-semibold text-emerald-700">2 Sides</span>,{" "}
              <span className="font-semibold text-orange-700">Bread</span>,{" "}
              <span className="font-semibold text-purple-700">Dessert</span>, and{" "}
              <span className="font-semibold text-blue-700">Drink</span>.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-stone-900">
                1-Side or Veggie Plate
              </h2>
              <span className="text-2xl font-extrabold text-stone-900">$12</span>
            </div>
            <p className="mt-1.5 text-sm text-stone-600">
              Includes{" "}
              <span className="font-semibold text-red-700">1 Meat</span> +{" "}
              <span className="font-semibold text-emerald-700">1 Side</span> +{" "}
              <span className="font-semibold text-orange-700">Bread</span>, OR{" "}
              <span className="font-semibold text-emerald-700">
                3-Side Veggie Plate
              </span>{" "}
              + <span className="font-semibold text-orange-700">Bread</span>.
            </p>
          </div>
        </section>

        {/* COLOR-CODED MENU REFERENCE */}
        <section className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900">
                Current Menu Offerings
              </h2>
              <p className="text-xs text-stone-500">
                Color-coded to match order entry pills
              </p>
            </div>
            <Link
              href="/admin"
              className="text-xs font-bold text-amber-800 hover:underline"
            >
              Edit Menu →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* MEATS - RED */}
            <div className="p-3.5 rounded-xl bg-red-50/50 border border-red-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-700 mb-2">
                Meats
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {menu.meats.map((item) => {
                  const isOut = soldOutList.includes(item);
                  return (
                    <span
                      key={item}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isOut
                          ? "bg-stone-200 text-stone-500 line-through"
                          : "bg-red-100 text-red-900"
                      }`}
                    >
                      {item} {isOut ? "(Sold Out)" : ""}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* SIDES - GREEN */}
            <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">
                Sides
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {menu.sides.map((item) => {
                  const isOut = soldOutList.includes(item);
                  return (
                    <span
                      key={item}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isOut
                          ? "bg-stone-200 text-stone-500 line-through"
                          : "bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      {item} {isOut ? "(Sold Out)" : ""}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* BREAD - ORANGE */}
            <div className="p-3.5 rounded-xl bg-orange-50/50 border border-orange-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-700 mb-2">
                Bread
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {menu.breads.map((item) => {
                  const isOut = soldOutList.includes(item);
                  return (
                    <span
                      key={item}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isOut
                          ? "bg-stone-200 text-stone-500 line-through"
                          : "bg-orange-100 text-orange-900"
                      }`}
                    >
                      {item} {isOut ? "(Sold Out)" : ""}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* DRINKS - BLUE */}
            <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-2">
                Drinks
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {menu.drinks.map((item) => {
                  const isOut = soldOutList.includes(item);
                  return (
                    <span
                      key={item}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isOut
                          ? "bg-stone-200 text-stone-500 line-through"
                          : "bg-blue-100 text-blue-900"
                      }`}
                    >
                      {item} {isOut ? "(Sold Out)" : ""}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* DESSERTS - PURPLE */}
            <div className="p-3.5 rounded-xl bg-purple-50/50 border border-purple-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 mb-2">
                Desserts
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {menu.desserts.map((item) => {
                  const isOut = soldOutList.includes(item);
                  return (
                    <span
                      key={item}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isOut
                          ? "bg-stone-200 text-stone-500 line-through"
                          : "bg-purple-100 text-purple-900"
                      }`}
                    >
                      {item} {isOut ? "(Sold Out)" : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

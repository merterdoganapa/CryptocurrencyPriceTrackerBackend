import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore} from "firebase-admin/firestore";

const setCorsHeaders = (res: any) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
};

initializeApp();
const db = getFirestore();

export const getMarkets = onRequest(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({
      status: 405,
      message: "Method Not Allowed",
      data: null,
    });
    return;
  }

  const rawCurrency = (req.query.currency as string) || "usd";
  const currency = String(rawCurrency).toLowerCase();

  if (!/^[a-z]{2,10}$/.test(currency)) {
    res.status(400).json({
      status: 400,
      message: "Invalid currency parameter",
      data: null,
    });
    return;
  }

  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${encodeURIComponent(currency)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {Accept: "application/json"},
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error("CoinGecko API error", {status: response.status, text});
      res.status(response.status).json({
        status: response.status,
        message: "Upstream CoinGecko error",
        data: {error: text},
      });
      return;
    }

    const data = await response.json();
    res.status(200).json({
      status: 200,
      message: "Markets fetched successfully",
      data: {markets: data},
    });
  } catch (error: any) {
    logger.error("Failed to fetch from CoinGecko", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch data",
      data: null,
    });
  }
});

export const getFavorites = onRequest(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({
      status: 405,
      message: "Method Not Allowed",
      data: null,
    });
    return;
  }

  const userIdRaw = req.method === "GET"
    ? (req.query.userId as string) || ""
    : ((req.body ?? {}).userId as string) || "";
  const userId = String(userIdRaw).trim();

  if (!userId || !/^[a-zA-Z0-9_-]{3,128}$/.test(userId)) {
    res.status(400).json({
      status: 400,
      message: "Invalid or missing 'userId'",
      data: null,
    });
    return;
  }

  try {
    const favoritesSnap = await db
      .collection("users")
      .doc(userId)
      .collection("favorites")
      .orderBy("createdAt", "desc")
      .get();

    const favorites = favoritesSnap.docs.map((d) => d.id);

    res.status(200).json({
      status: 200,
      message: "Favorites fetched successfully",
      data: {favorites},
    });
  } catch (error: any) {
    logger.error("Failed to fetch favorites", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch favorites",
      data: null,
    });
  }
});

export const toggleFavorite = onRequest(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({
      status: 405,
      message: "Method Not Allowed",
      data: null,
    });
    return;
  }

  const body = (req.body ?? {}) as {userId?: string; coinId?: string};
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const coinId = typeof body.coinId === "string" ? body.coinId.trim().toLowerCase() : "";

  if (!userId || !/^[a-zA-Z0-9_-]{3,128}$/.test(userId)) {
    res.status(400).json({
      status: 400,
      message: "Invalid or missing 'userId'",
      data: null,
    });
    return;
  }

  if (!coinId || !/^[a-z0-9-]{2,100}$/.test(coinId)) {
    res.status(400).json({
      status: 400,
      message: "Invalid or missing 'coinId'",
      data: null,
    });
    return;
  }

  const favoriteRef = db
    .collection("users")
    .doc(userId)
    .collection("favorites")
    .doc(coinId);

  try {
    const favorited = await db.runTransaction(async (tx) => {
      const snap = await tx.get(favoriteRef);
      if (snap.exists) {
        tx.delete(favoriteRef);
        return false;
      } else {
        tx.set(favoriteRef, {
          coinId,
          createdAt: FieldValue.serverTimestamp(),
        });
        return true;
      }
    });

    res.status(200).json({
      status: 200,
      message: favorited ? "Added to favorites" : "Removed from favorites",
      data: {favorited},
    });
  } catch (error: any) {
    logger.error("Failed to toggle favorite", error);
    res.status(500).json({
      status: 500,
      message: "Failed to toggle favorite",
      data: null,
    });
  }
});

export const getCoin = onRequest(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({
      status: 405,
      message: "Method Not Allowed",
      data: null,
    });
    return;
  }

  const body = (req.body ?? {}) as {id?: string};
  const id = typeof body.id === "string" ? body.id.trim().toLowerCase() : "";

  if (!id || !/^[a-z0-9-]{2,100}$/.test(id)) {
    res.status(400).json({
      status: 400,
      message: "Invalid or missing 'id' in request body",
      data: null,
    });
    return;
  }

  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {Accept: "application/json"},
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error("CoinGecko coin API error", {status: response.status, text});
      res.status(response.status).json({
        status: response.status,
        message: "Upstream CoinGecko error",
        data: {error: text},
      });
      return;
    }

    const data = await response.json();
    res.status(200).json({
      status: 200,
      message: "Coin fetched successfully",
      data: {coin: data},
    });
  } catch (error: any) {
    logger.error("Failed to fetch coin from CoinGecko", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch data",
      data: null,
    });
  }
});


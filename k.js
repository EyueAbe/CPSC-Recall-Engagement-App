const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand
} = require("@aws-sdk/lib-dynamodb");

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION }),
  { marshallOptions: { removeUndefinedValues: true } }
);

const USERS_TABLE = process.env.USERS_TABLE || "safecheck-users";
const APPDATA_TABLE = process.env.APPDATA_TABLE || "safecheck-appdata";
const CPSC_BASE =
  process.env.CPSC_API_BASE || "https://www.saferproducts.gov/RestWebServices";
const UPC_KEY = process.env.UPCITEMDB_KEY || "";

exports.handler = async (event) => {
  console.log("App event:", JSON.stringify(event));

  const userId = getUserId(event);
  if (!userId) {
    return reply(401, { error: "Unauthorized — missing or invalid token." });
  }

  const method = event.httpMethod;
  const path = event.resource || event.path || "";

  try {
    // Scan
    if (method === "POST" && path === "/scan") {
      return await handleScan(userId, event);
    }

    // Inventory
    if (method === "GET" && path === "/inventory") {
      return await getInventory(userId);
    }
    if (method === "POST" && path === "/inventory") {
      return await addInventoryItem(userId, event);
    }
    if (method === "DELETE" && path === "/inventory") {
      return await deleteInventoryItem(userId, event);
    }

    // Community
    if (method === "GET" && path === "/community") {
      return await getCommunityPosts();
    }
    if (method === "POST" && path === "/community") {
      return await createPost(userId, event);
    }
    if (method === "GET" && path === "/community/feed") {
      return await getOfficialFeed();
    }

    // Points
    if (
      method === "GET" &&
      (path === "/points" || path === "/community/points")
    ) {
      return await getPoints(userId);
    }

    return reply(404, { error: "Route not found" });
  } catch (err) {
    console.error("App error:", err);
    return reply(500, {
      error: err.message || "Something went wrong. Please try again."
    });
  }
};

// ============================================================
// SCAN
// ============================================================

async function handleScan(userId, event) {
  const { barcode, productName } = JSON.parse(event.body || "{}");

  const cleanBarcode = String(barcode || "").trim();
  const cleanProductName = String(productName || "").trim();

  if (!cleanBarcode && !cleanProductName) {
    return reply(400, { error: "barcode or productName is required." });
  }

  let resolvedName = cleanProductName || null;
  let brand = null;

  // 1) Try barcode lookup first to get a usable product name
  if (cleanBarcode) {
    const barcodeResult = await lookupBarcode(cleanBarcode);
    if (barcodeResult) {
      resolvedName = barcodeResult.name || resolvedName;
      brand = barcodeResult.brand || null;
    }
  }

  // 2) If we still do not know the product, return unknown
  if (!resolvedName) {
    return reply(200, {
      productName: cleanProductName || cleanBarcode,
      barcode: cleanBarcode || null,
      brand: null,
      status: "unknown",
      recallNumber: null,
      hazard: null,
      remedy: null,
      recallDate: null,
      cpscUrl: null,
      pointsEarned: 0,
      message: "Could not identify this product. Try entering the product name manually."
    });
  }

  const cacheKey = `CPSC_CACHE#${(cleanBarcode || resolvedName)
    .replace(/\s+/g, "_")
    .toUpperCase()}`;

  const cached = await dbGet(APPDATA_TABLE, { pk: cacheKey, sk: "CACHE" });

  let cpscResult;

  if (cached && cached.cachedAt && Date.now() - cached.cachedAt < 86400000) {
    cpscResult = cached.data;
  } else {
    cpscResult = await lookupCPSC({
      barcode: cleanBarcode,
      productName: resolvedName,
      brand
    });

    await dbPut(APPDATA_TABLE, {
      pk: cacheKey,
      sk: "CACHE",
      data: cpscResult,
      cachedAt: Date.now(),
      ttl: Math.floor(Date.now() / 1000) + 86400
    });
  }

  const pointsEarned = 10;
  await addPoints(userId, pointsEarned);

  return reply(200, {
    productName: resolvedName,
    brand,
    barcode: cleanBarcode || null,
    ...cpscResult,
    pointsEarned,
    message:
      cpscResult.status === "recalled"
        ? "This item has been recalled — take action and remove it from use."
        : cpscResult.status === "warning"
          ? "Safety advisory found — please review the guidance below."
          : cpscResult.status === "unknown"
            ? "We could not confidently match this item in CPSC data."
            : "No recalls found — this item appears safe."
  });
}

async function lookupBarcode(barcode) {
  try {
    const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(
      barcode
    )}`;

    const headers = UPC_KEY ? { Authorization: `Bearer ${UPC_KEY}` } : {};
    const res = await fetch(url, { headers });

    if (!res.ok) return null;

    const data = await res.json();
    const item = data?.items?.[0];
    if (!item) return null;

    return {
      name: item.title || item.description || null,
      brand: item.brand || null
    };
  } catch (err) {
    console.warn("UPC lookup failed:", err.message);
    return null;
  }
}

async function lookupCPSC({ barcode, productName, brand }) {
  try {
    // First try UPC if we have one
    if (barcode) {
      const upcRecall = await fetchCPSCRecall({
        UPC: barcode
      });

      if (upcRecall) {
        return normalizeRecall(upcRecall);
      }
    }

    // Then try product name + manufacturer
    if (productName) {
      const productRecall = await fetchCPSCRecall({
        ProductName: productName,
        Manufacturer: brand || undefined
      });

      if (productRecall) {
        return normalizeRecall(productRecall);
      }
    }

    return {
      status: "safe",
      recallNumber: null,
      hazard: null,
      remedy: null,
      manufacturer: brand || null,
      recallDate: null,
      unitsAffected: null,
      cpscUrl: null
    };
  } catch (err) {
    console.warn("CPSC lookup failed:", err.message);
    return {
      status: "unknown",
      recallNumber: null,
      hazard: null,
      remedy: null,
      manufacturer: brand || null,
      recallDate: null,
      unitsAffected: null,
      cpscUrl: null
    };
  }
}

async function fetchCPSCRecall(filters) {
  const params = new URLSearchParams({ format: "json" });

  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  const res = await fetch(`${CPSC_BASE}/Recall?${params.toString()}`, {
    headers: { Accept: "application/json" }
  });

  if (!res.ok) {
    throw new Error(`CPSC API returned ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

function normalizeRecall(recall) {
  return {
    status: "recalled",
    recallNumber:
      recall.RecallNumber ||
      recall.RecallID ||
      recall.RecallNum ||
      null,
    hazard:
      recall.Hazard ||
      recall.Hazards?.[0]?.Name ||
      recall.Description ||
      "See CPSC for details",
    remedy:
      recall.Remedy ||
      recall.Remedies?.[0]?.Name ||
      "Stop use and contact the manufacturer",
    manufacturer:
      recall.Manufacturer ||
      recall.Manufacturers?.[0]?.Name ||
      null,
    recallDate: recall.RecallDate || null,
    unitsAffected: recall.NumberOfUnits || null,
    cpscUrl:
      recall.RecallURL ||
      recall.URL ||
      null
  };
}

// ============================================================
// INVENTORY
// ============================================================

async function getInventory(userId) {
  const items = await dbQueryByPrefix(APPDATA_TABLE, `ITEM#${userId}#`);

  const summary = {
    total: items.length,
    recalled: items.filter(i => i.status === "recalled").length,
    warning: items.filter(i => i.status === "warning").length,
    safe: items.filter(i => i.status === "safe").length
  };

  const order = { recalled: 0, warning: 1, safe: 2, unknown: 3 };
  items.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  return reply(200, { items, summary });
}

async function addInventoryItem(userId, event) {
  const { productName, barcode, status, cpscData, emoji } = JSON.parse(event.body || "{}");
  if (!productName) return reply(400, { error: "productName is required." });

  const itemId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const item = {
    pk: `ITEM#${userId}#${itemId}`,
    sk: "ITEM",
    itemId,
    userId,
    productName,
    barcode: barcode || null,
    status: status || "safe",
    actionStatus: "none",
    cpscData: cpscData || null,
    emoji: emoji || "📦",
    addedAt: now,
    updatedAt: now
  };

  await dbPut(APPDATA_TABLE, item);
  return reply(201, { item, message: "Item added to your inventory." });
}

async function deleteInventoryItem(userId, event) {
  const { itemId } = JSON.parse(event.body || "{}");
  if (!itemId) return reply(400, { error: "itemId is required." });

  const pk = `ITEM#${userId}#${itemId}`;
  const existing = await dbGet(APPDATA_TABLE, { pk, sk: "ITEM" });
  if (!existing) return reply(404, { error: "Item not found." });

  await dynamo.send(
    new DeleteCommand({
      TableName: APPDATA_TABLE,
      Key: { pk, sk: "ITEM" }
    })
  );

  return reply(200, { message: "Item deleted." });
}

// ============================================================
// COMMUNITY
// ============================================================

async function getCommunityPosts() {
  const posts = await dbQueryByPrefix(APPDATA_TABLE, "POST#");
  posts.sort((a, b) => (b.votes || 0) - (a.votes || 0) || (b.createdAt > a.createdAt ? 1 : -1));
  return reply(200, { posts, total: posts.length });
}

async function createPost(userId, event) {
  const { title, body, hazardTag, productName } = JSON.parse(event.body || "{}");

  if (!title || !body) return reply(400, { error: "title and body are required." });
  if (title.length > 120) return reply(400, { error: "title must be under 120 characters." });

  const VALID_TAGS = ["fire", "electrical", "injury", "choking", "chemical", "tip-over", "other"];
  if (hazardTag && !VALID_TAGS.includes(hazardTag)) {
    return reply(400, { error: `hazardTag must be one of: ${VALID_TAGS.join(", ")}` });
  }

  const user = await dbGet(USERS_TABLE, { userId });
  const author = user?.name || user?.email || "Anonymous";

  const postId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const post = {
    pk: `POST#${postId}`,
    sk: "POST",
    postId,
    authorId: userId,
    authorName: author,
    title,
    body,
    hazardTag: hazardTag || "other",
    productName: productName || null,
    votes: 0,
    status: "active",
    createdAt: now,
    updatedAt: now
  };

  await dbPut(APPDATA_TABLE, post);
  await addPoints(userId, 25);

  return reply(201, {
    post,
    pointsEarned: 25,
    message: "+25 pts for your safety report!"
  });
}

async function getOfficialFeed() {
  try {
    const params = new URLSearchParams({
      format: "json"
    });

    const res = await fetch(`${CPSC_BASE}/Recall?${params.toString()}`, {
      headers: { Accept: "application/json" }
    });

    if (!res.ok) {
      throw new Error(`CPSC feed returned ${res.status}`);
    }

    const data = await res.json();

    const items = (Array.isArray(data) ? data : [])
      .map((item, index) => {
        const title =
          item.RecallTitle ||
          item.ProductName ||
          "CPSC Recall Notice";

        const summary =
          item.Hazard ||
          item.Description ||
          "Official recall notice from the U.S. Consumer Product Safety Commission.";

        return {
          id:
            item.RecallNumber ||
            item.RecallID ||
            `recall-${index}`,

          type: "recall",

          title: cleanText(title),

          summary: cleanText(summary).slice(0, 180),

          date: item.RecallDate || null,

          productName: item.ProductName || null,

          url: item.RecallURL || item.URL || null,

          source: "CPSC"
        };
      })

      // sort newest first
      .sort((a, b) => new Date(b.date) - new Date(a.date))

      // limit for UI performance
      .slice(0, 12);

    return reply(200, {
      items,
      total: items.length
    });

  } catch (err) {
    console.warn("Official feed failed:", err.message);

    return reply(200, {
      items: [],
      total: 0
    });
  }
}

function cleanText(text = "") {
  return text
    .replace(/<[^>]*>?/gm, "")   // remove HTML
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// POINTS
// ============================================================

const REWARDS = [
  { id: "donate-safekids", name: "Donate to Safe Kids Worldwide", cost: 500, tier: "Scout" },
  { id: "amazon-5", name: "$5 Amazon Credit", cost: 2000, tier: "Guardian" },
  { id: "target-10", name: "Target 10% Off Coupon", cost: 3000, tier: "Protector" },
  { id: "cpsc-certificate", name: "CPSC Community Certificate", cost: 5000, tier: "Champion" }
];

const TIERS = [
  { name: "Scout", min: 0 },
  { name: "Watcher", min: 500 },
  { name: "Guardian", min: 1500 },
  { name: "Protector", min: 3000 },
  { name: "Champion", min: 6000 }
];

async function getPoints(userId) {
  const user = await dbGet(USERS_TABLE, { userId });
  if (!user) return reply(404, { error: "User not found." });

  const total = user.totalPoints || 0;
  const lifetime = user.lifetimePoints || 0;
  const tier = user.tier || "Scout";
  const tierIdx = TIERS.findIndex(t => t.name === tier);
  const nextTier = TIERS[tierIdx + 1] || null;

  const rewards = REWARDS.map(r => ({
    ...r,
    unlocked: TIERS.findIndex(t => t.name === r.tier) <= tierIdx,
    canAfford: total >= r.cost
  }));

  return reply(200, {
    totalPoints: total,
    lifetimePoints: lifetime,
    tier,
    nextTier: nextTier?.name || null,
    pointsToNextTier: nextTier ? Math.max(0, nextTier.min - total) : null,
    rewards
  });
}

// ============================================================
// HELPERS
// ============================================================

async function addPoints(userId, amount) {
  const now = new Date().toISOString();

  const result = await dynamo.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression:
        "SET totalPoints = if_not_exists(totalPoints, :zero) + :amt, lifetimePoints = if_not_exists(lifetimePoints, :zero) + :amt, updatedAt = :ts",
      ExpressionAttributeValues: {
        ":amt": amount,
        ":zero": 0,
        ":ts": now
      },
      ReturnValues: "ALL_NEW"
    })
  );

  const newTotal = result.Attributes?.totalPoints || 0;
  const newTier = [...TIERS].reverse().find(t => newTotal >= t.min)?.name || "Scout";
  const oldTier = result.Attributes?.tier || "Scout";

  if (newTier !== oldTier) {
    await dynamo.send(
      new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: "SET tier = :tier",
        ExpressionAttributeValues: { ":tier": newTier }
      })
    );
  }
}

function getUserId(event) {
  return event?.requestContext?.authorizer?.claims?.sub || null;
}

async function dbGet(table, key) {
  const result = await dynamo.send(
    new GetCommand({
      TableName: table,
      Key: key
    })
  );
  return result.Item || null;
}

async function dbPut(table, item) {
  await dynamo.send(
    new PutCommand({
      TableName: table,
      Item: item
    })
  );
  return item;
}

async function dbQueryByPrefix(table, pkPrefix) {
  const result = await dynamo.send(
    new ScanCommand({
      TableName: table
    })
  );
  return (result.Items || []).filter(
    item => typeof item.pk === "string" && item.pk.startsWith(pkPrefix)
  );
}

function reply(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization"
    },
    body: JSON.stringify(body)
  };
}
// src/blockonomics.js
import axios from "axios";

const BASE = "https://www.blockonomics.co/api";

const client = axios.create({
    baseURL: BASE,
    headers: { Authorization: `Bearer ${process.env.BLOCKONOMICS_API_KEY}` },
});

/**
 * Create a temporary product (one-off) under a parent product.
 * Temp products are auto-deleted after 7 days; orders against them persist.
 *
 * @param {object} opts
 * @param {string} opts.parentUid - Widget UID of the parent product
 * @param {string} [opts.productName] - Override the product name
 * @param {string} [opts.productDescription] - e.g. "Red T-shirt size L"
 * @param {number} [opts.valueMinor] - Price in the smallest unit (e.g. cents/pence)
 * @param {string} [opts.extraData] - Anything you want echoed back on the order
 * @returns {Promise<{ uid: string }>}
 */
export async function createTempProduct({
    parentUid,
    productName,
    productDescription,
    valueMinor,
    extraData,
}) {
    const body = { parent_uid: parentUid };
    if (productName) body.product_name = productName;
    if (productDescription) body.product_description = productDescription;
    if (valueMinor != null) body.value = valueMinor;
    if (extraData) body.extra_data = extraData;

    const { data } = await client.post("/create_temp_product", body);
    // Response: { "uid": "f7570454529a11e7-1ee5f340" }
    return { uid: data.uid };
}

/**
 * Fetch a single order's details by UUID. Used after the order callback.
 */
export async function getMerchantOrder(uuid) {
    const { data } = await client.get(`/merchant_order/${uuid}`);
    return data;
}

/**
 * List all payment-button orders.
 * @param {number} [limit=500]
 */
export async function listMerchantOrders(limit = 500) {
    const { data } = await client.get("/merchant_orders", { params: { limit } });
    return data; // array of orders, newest first
}

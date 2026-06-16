// src/catalog.js
// A tiny book catalogue for the demo storefront. In a real app this lives in
// your own database. Prices are in MINOR units (pence) — £24.99 => 2499.

export const STORE = {
    name: "Satoshi Books",
    tagline: "Independent bookshop · Pay with Bitcoin",
    currency: "GBP",
    currencySymbol: "£",
};

export const BOOKS = [
    {
        productId: "btc-standard",
        title: "The Bitcoin Standard",
        author: "Saifedean Ammous",
        priceMinor: 2499,
        cover: "#f7931a",
        blurb:
            "The decentralized alternative to central banking — why Bitcoin is the soundest money ever invented.",
        pages: 304,
    },
    {
        productId: "mastering-bitcoin",
        title: "Mastering Bitcoin",
        author: "Andreas M. Antonopoulos",
        priceMinor: 3299,
        cover: "#4b6cb7",
        blurb:
            "Programming the open blockchain. The definitive technical deep-dive for developers.",
        pages: 416,
    },
    {
        productId: "programming-bitcoin",
        title: "Programming Bitcoin",
        author: "Jimmy Song",
        priceMinor: 3799,
        cover: "#2c3e50",
        blurb:
            "Learn how to program Bitcoin from scratch — build the libraries yourself in Python.",
        pages: 322,
    },
    {
        productId: "broken-money",
        title: "Broken Money",
        author: "Lyn Alden",
        priceMinor: 2899,
        cover: "#16a085",
        blurb:
            "Why our financial system is failing us, and how the technology of money is evolving.",
        pages: 540,
    },
    {
        productId: "internet-of-money",
        title: "The Internet of Money",
        author: "Andreas M. Antonopoulos",
        priceMinor: 1599,
        cover: "#8e44ad",
        blurb:
            "A collection of talks on the philosophical, social, and historical implications of Bitcoin.",
        pages: 154,
    },
    {
        productId: "layered-money",
        title: "Layered Money",
        author: "Nik Bhatia",
        priceMinor: 1999,
        cover: "#c0392b",
        blurb:
            "From gold and dollars to Bitcoin and central bank digital currencies — money as a layered system.",
        pages: 192,
    },
];

export function findBook(productId) {
    return BOOKS.find((b) => b.productId === productId) || null;
}

export function formatPrice(minor) {
    return `${STORE.currencySymbol}${(minor / 100).toFixed(2)}`;
}

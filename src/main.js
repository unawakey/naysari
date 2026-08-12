import "./style.css";
import { createClient } from "@supabase/supabase-js";

// ==========================================
// 1. DATABASE INITIALIZATION (SUPABASE)
// ==========================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Supabase environment variables are missing! Make sure your .env file is set up correctly.",
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==========================================
// 2. STATE MANAGEMENT
// ==========================================

// Default products to populate the store initially if the cloud database is brand new
const DEFAULT_PRODUCTS = [
  { name: "Coke Sakto", price: 15 },
  { name: "Chippy Large", price: 20 },
  { name: "Pancit Canton", price: 18 },
  { name: "Nescafé 3-in-1", price: 12 },
];

let state = {
  products: [],
  cart: JSON.parse(localStorage.getItem("naysari_cart")) || [], // Keep cart local
  unpaidEntries: [],
};

// Helper function to save current cart state to LocalStorage (cart is kept offline)
function saveLocalCart() {
  localStorage.setItem("naysari_cart", JSON.stringify(state.cart));
}

// Backup local cache for offline resiliency
function saveLocalCache() {
  localStorage.setItem(
    "naysari_products_cache",
    JSON.stringify(state.products),
  );
  localStorage.setItem(
    "naysari_unpaid_cache",
    JSON.stringify(state.unpaidEntries),
  );
}

// ==========================================
// 3. DOM ELEMENT REFERENCES
// ==========================================
const totalOwedEl = document.getElementById("total-owed");
const btnPaybackEl = document.getElementById("btn-payback");
const productsListEl = document.getElementById("products-list");
const addProductFormEl = document.getElementById("add-product-form");
const cartListEl = document.getElementById("cart-list");
const cartActionsEl = document.getElementById("cart-actions");
const cartTotalEl = document.getElementById("cart-total");
const btnCheckoutEl = document.getElementById("btn-checkout");
const historyListEl = document.getElementById("history-list");

// ==========================================
// 4. RENDERING FUNCTIONS (UI UPDATES)
// ==========================================

// Helper to calculate the amount of a transaction entry dynamically
function getEntryAmount(entry) {
  if (entry.items && Array.isArray(entry.items)) {
    return entry.items.reduce((sum, item) => {
      const currentProduct = state.products.find((p) => p.id === item.id);
      const currentPrice = currentProduct
        ? parseFloat(currentProduct.price)
        : parseFloat(item.price);
      return sum + currentPrice * item.quantity;
    }, 0);
  }
  return parseFloat(entry.amount || 0);
}

// Helper to get the description of an entry dynamically (adapting to product name edits)
function getEntryDescription(entry) {
  if (entry.items && Array.isArray(entry.items)) {
    return entry.items
      .map((item) => {
        const currentProduct = state.products.find((p) => p.id === item.id);
        const name = currentProduct ? currentProduct.name : item.name;
        return `${name}${item.quantity > 1 ? ` x${item.quantity}` : ""}`;
      })
      .join(", ");
  }
  return entry.description;
}

// Updates the Header Total Owed
function renderTotalOwed() {
  const total = state.unpaidEntries.reduce(
    (sum, entry) => sum + getEntryAmount(entry),
    0,
  );
  totalOwedEl.textContent = `₱${total.toFixed(2)}`;

  // Disable reset button if nothing is owed
  btnPaybackEl.disabled = total === 0;
  btnPaybackEl.style.opacity = total === 0 ? "0.5" : "1";
  btnPaybackEl.style.cursor = total === 0 ? "not-allowed" : "pointer";
}

// Renders the Product Cards
function renderProducts() {
  if (state.products.length === 0) {
    productsListEl.innerHTML =
      '<p class="placeholder">No products added yet.</p>';
    return;
  }

  productsListEl.innerHTML = state.products
    .map(
      (product) => `
      <div class="product-card" data-id="${product.id}">
        <div class="product-card-body">
          <span class="name">${escapeHTML(product.name)}</span>
          <span class="price">₱${parseFloat(product.price).toFixed(2)}</span>
        </div>
        <div class="product-card-actions">
          <button class="btn-product-edit" data-id="${product.id}">✏️ Edit</button>
          <button class="btn-product-delete" data-id="${product.id}">❌ Delete</button>
        </div>
      </div>
    `,
    )
    .join("");

  // Attach event listeners to all newly rendered product cards
  productsListEl.querySelectorAll(".product-card").forEach((card) => {
    // Tapping the card body adds it to the cart
    card.querySelector(".product-card-body").addEventListener("click", () => {
      const productId = card.getAttribute("data-id");
      addToCart(productId);
    });
  });

  // Attach edit actions
  productsListEl.querySelectorAll(".btn-product-edit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const productId = btn.getAttribute("data-id");
      editProductPrice(productId);
    });
  });

  // Attach delete actions
  productsListEl.querySelectorAll(".btn-product-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const productId = btn.getAttribute("data-id");
      deleteProduct(productId);
    });
  });
}

// Renders Cart Items
function renderCart() {
  if (state.cart.length === 0) {
    cartListEl.innerHTML = '<p class="placeholder">Cart is empty.</p>';
    cartActionsEl.style.display = "none";
    return;
  }

  cartListEl.innerHTML = state.cart
    .map(
      (item) => `
      <div class="cart-item">
        <div class="cart-item-details">
          <span class="cart-item-name">${escapeHTML(item.name)}</span>
          <span class="cart-item-meta">₱${parseFloat(item.price).toFixed(2)} x ${item.quantity}</span>
        </div>
        <div class="cart-item-actions">
          <span>₱${(parseFloat(item.price) * item.quantity).toFixed(2)}</span>
          <button class="btn-remove" data-id="${item.id}">Remove</button>
        </div>
      </div>
    `,
    )
    .join("");

  // Calculate cart total
  const cartTotal = state.cart.reduce(
    (sum, item) => sum + parseFloat(item.price) * item.quantity,
    0,
  );
  cartTotalEl.textContent = `₱${cartTotal.toFixed(2)}`;
  cartActionsEl.style.display = "block";

  // Attach remove action listeners
  cartListEl.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const productId = btn.getAttribute("data-id");
      removeFromCart(productId);
    });
  });
}

// Renders Unpaid History Logs
function renderHistory() {
  if (state.unpaidEntries.length === 0) {
    historyListEl.innerHTML =
      '<p class="placeholder">No unpaid entries yet.</p>';
    return;
  }

  // Show newest entries first
  const sortedEntries = [...state.unpaidEntries].reverse();

  historyListEl.innerHTML = sortedEntries
    .map((entry) => {
      const dateStr = new Date(entry.timestamp).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const desc = getEntryDescription(entry);
      const amount = getEntryAmount(entry);
      return `
        <div class="history-item">
          <div>
            <div class="history-desc">${escapeHTML(desc)}</div>
            <div class="history-date">${dateStr}</div>
          </div>
          <span class="history-amount">₱${amount.toFixed(2)}</span>
        </div>
      `;
    })
    .join("");
}

// Trigger all render components at once
function renderAll() {
  renderTotalOwed();
  renderProducts();
  renderCart();
  renderHistory();
}

// ==========================================
// 5. CLOUD DATABASE SYNC (SUPABASE OPERATIONS)
// ==========================================

// Initial fetch to load all data from Supabase Cloud
async function fetchCloudData() {
  try {
    // 1. Fetch Products from Supabase
    let { data: productsData, error: productsError } = await supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true });

    if (productsError) throw productsError;

    // Seeding: If DB is empty, let's pre-load default products automatically
    if (!productsData || productsData.length === 0) {
      const { data: seededData, error: seedError } = await supabase
        .from("products")
        .insert(DEFAULT_PRODUCTS)
        .select();

      if (seedError) throw seedError;
      state.products = seededData || [];
    } else {
      state.products = productsData;
    }

    // 2. Fetch Unpaid Entries from Supabase
    let { data: unpaidData, error: unpaidError } = await supabase
      .from("unpaid_entries")
      .select("*")
      .order("timestamp", { ascending: true });

    if (unpaidError) throw unpaidError;
    state.unpaidEntries = unpaidData || [];

    // Cache to LocalStorage for offline backup/resiliency
    saveLocalCache();
    renderAll();
  } catch (error) {
    console.error(
      "Supabase fetch failed, falling back to local cache:",
      error.message,
    );

    // Fallback loading from local cache if we are completely offline
    state.products =
      JSON.parse(localStorage.getItem("naysari_products_cache")) || [];
    state.unpaidEntries =
      JSON.parse(localStorage.getItem("naysari_unpaid_cache")) || [];
    renderAll();
  }
}

// Add product to the Supabase Database
async function addProduct(name, price) {
  const newProduct = {
    name: name.trim(),
    price: parseFloat(price),
  };

  try {
    const { data, error } = await supabase
      .from("products")
      .insert([newProduct])
      .select();

    if (error) throw error;

    if (data) {
      state.products.push(data[0]);
      // Sort alphabetically by name
      state.products.sort((a, b) => a.name.localeCompare(b.name));
      saveLocalCache();
      renderProducts();
    }
  } catch (error) {
    alert("Could not add product to cloud database: " + error.message);
  }
}

// Delete product from the Supabase Database
async function deleteProduct(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  if (confirm(`Are you sure you want to delete "${product.name}"?`)) {
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productId);

      if (error) throw error;

      state.products = state.products.filter((p) => p.id !== productId);
      state.cart = state.cart.filter((item) => item.id !== productId);

      saveLocalCart();
      saveLocalCache();
      renderProducts();
      renderCart();
    } catch (error) {
      alert("Could not delete product from cloud database: " + error.message);
    }
  }
}

// Update product price in the Supabase Database
async function editProductPrice(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  const newPriceStr = prompt(
    `Enter new price for "${product.name}":`,
    parseFloat(product.price).toFixed(2),
  );

  if (newPriceStr === null) return; // Cancelled

  const newPrice = parseFloat(newPriceStr);
  if (isNaN(newPrice) || newPrice < 0) {
    alert("Please enter a valid positive number for the price.");
    return;
  }

  try {
    const { error } = await supabase
      .from("products")
      .update({ price: newPrice })
      .eq("id", productId);

    if (error) throw error;

    product.price = newPrice;

    // If the edited product is in the active cart, update its price too
    const cartItem = state.cart.find((item) => item.id === productId);
    if (cartItem) {
      cartItem.price = newPrice;
      saveLocalCart();
    }

    saveLocalCache();
    renderProducts();
    renderCart();
    // Recalculate and re-render unpaid log and total immediately
    renderTotalOwed();
    renderHistory();
  } catch (error) {
    alert("Could not update product price in cloud database: " + error.message);
  }
}

// Checkout active cart and insert debt log as a record in Supabase
async function checkout() {
  if (state.cart.length === 0) return;

  const totalAmount = state.cart.reduce(
    (sum, item) => sum + parseFloat(item.price) * item.quantity,
    0,
  );

  // Store structured items so price changes can dynamically update unpaid logs/totals
  const items = state.cart.map((item) => ({
    id: item.id,
    name: item.name,
    price: parseFloat(item.price),
    quantity: item.quantity,
  }));

  const description = state.cart
    .map(
      (item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}`,
    )
    .join(", ");

  const newEntry = {
    description,
    amount: totalAmount,
    items: items,
  };

  try {
    const { data, error } = await supabase
      .from("unpaid_entries")
      .insert([newEntry])
      .select();

    if (error) throw error;

    if (data) {
      state.unpaidEntries.push(data[0]);
      state.cart = []; // Empty temporary local cart
      saveLocalCart();
      saveLocalCache();
      renderAll();
    }
  } catch (error) {
    alert("Could not confirm purchase: " + error.message);
  }
}

// Reset all unpaid history (Paying back everything)
async function resetUnpaid() {
  if (
    confirm(
      "Are you sure you want to reset all unpaid purchases? This will clear your entire history in the cloud.",
    )
  ) {
    try {
      // In PostgreSQL/Supabase, a delete without restrictions removes all records.
      // We query all records and delete them.
      const { error } = await supabase
        .from("unpaid_entries")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Standard way to delete all rows

      if (error) throw error;

      state.unpaidEntries = [];
      saveLocalCache();
      renderAll();
    } catch (error) {
      alert("Could not reset unpaid history in cloud: " + error.message);
    }
  }
}

// ==========================================
// 6. LOCAL CART CORE ACTIONS
// ==========================================

// Add a product to the cart (kept in local session memory)
function addToCart(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  const existingCartItem = state.cart.find((item) => item.id === productId);

  if (existingCartItem) {
    existingCartItem.quantity += 1;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
    });
  }

  saveLocalCart();
  renderCart();
}

// Remove item from local cart completely
function removeFromCart(productId) {
  state.cart = state.cart.filter((item) => item.id !== productId);
  saveLocalCart();
  renderCart();
}

// ==========================================
// 7. EVENT LISTENERS
// ==========================================

// Handle product creation form submit
addProductFormEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("new-product-name");
  const priceInput = document.getElementById("new-product-price");

  addProduct(nameInput.value, priceInput.value);

  nameInput.value = "";
  priceInput.value = "";
  nameInput.focus();
});

// Handle Checkout button click
btnCheckoutEl.addEventListener("click", checkout);

// Handle Pay Back reset button click
btnPaybackEl.addEventListener("click", resetUnpaid);

// ==========================================
// 8. UTILITY FUNCTIONS
// ==========================================

function escapeHTML(str) {
  return str
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/'/g, "&#039;");
}

// ==========================================
// 9. INITIAL STARTUP
// ==========================================
// Run the cloud fetching sequence on start
fetchCloudData();

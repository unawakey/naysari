import "./style.css";

// ==========================================
// 1. STATE MANAGEMENT
// ==========================================

// Default products to populate the store initially so it's not empty
const DEFAULT_PRODUCTS = [
  { id: "1", name: "Coke Sakto", price: 15 },
  { id: "2", name: "Chippy Large", price: 20 },
  { id: "3", name: "Pancit Canton", price: 18 },
  { id: "4", name: "Nescafé 3-in-1", price: 12 },
];

// Load initial state from LocalStorage or use defaults
let state = {
  products:
    JSON.parse(localStorage.getItem("naysari_products")) || DEFAULT_PRODUCTS,
  cart: JSON.parse(localStorage.getItem("naysari_cart")) || [],
  unpaidEntries: JSON.parse(localStorage.getItem("naysari_unpaid")) || [],
};

// Helper function to save current state to LocalStorage
function saveState() {
  localStorage.setItem("naysari_products", JSON.stringify(state.products));
  localStorage.setItem("naysari_cart", JSON.stringify(state.cart));
  localStorage.setItem("naysari_unpaid", JSON.stringify(state.unpaidEntries));
}

// ==========================================
// 2. DOM ELEMENT REFERENCES
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
// 3. RENDERING FUNCTIONS (UI UPDATES)
// ==========================================

// Updates the Header Total Owed
function renderTotalOwed() {
  const total = state.unpaidEntries.reduce(
    (sum, entry) => sum + entry.amount,
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
        <span class="name">${escapeHTML(product.name)}</span>
        <span class="price">₱${product.price.toFixed(2)}</span>
      </div>
    `,
    )
    .join("");

  // Attach event listeners to all newly rendered product cards
  productsListEl.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => {
      const productId = card.getAttribute("data-id");
      addToCart(productId);
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
          <span class="cart-item-meta">₱${item.price.toFixed(2)} x ${item.quantity}</span>
        </div>
        <div class="cart-item-actions">
          <span>₱${(item.price * item.quantity).toFixed(2)}</span>
          <button class="btn-remove" data-id="${item.id}">Remove</button>
        </div>
      </div>
    `,
    )
    .join("");

  // Calculate cart total
  const cartTotal = state.cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
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
      return `
        <div class="history-item">
          <div>
            <div class="history-desc">${escapeHTML(entry.description)}</div>
            <div class="history-date">${dateStr}</div>
          </div>
          <span class="history-amount">₱${entry.amount.toFixed(2)}</span>
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
// 4. CORE ACTIONS & LOGIC
// ==========================================

// Add a product to the cart (or increment quantity if already exists)
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

  saveState();
  renderCart();
}

// Remove a product from the cart completely
function removeFromCart(productId) {
  state.cart = state.cart.filter((item) => item.id !== productId);
  saveState();
  renderCart();
}

// Add a new product to the list
function addProduct(name, price) {
  const newProduct = {
    id: Date.now().toString(), // Simple unique ID
    name: name.trim(),
    price: parseFloat(price),
  };

  state.products.push(newProduct);
  saveState();
  renderProducts();
}

// Confirm cart items and record them as unpaid debt
function checkout() {
  if (state.cart.length === 0) return;

  // Build transaction description (e.g. "Coke Sakto x2, Chippy Large")
  const description = state.cart
    .map(
      (item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}`,
    )
    .join(", ");

  const totalAmount = state.cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const newEntry = {
    id: Date.now().toString(),
    description,
    amount: totalAmount,
    timestamp: Date.now(),
  };

  state.unpaidEntries.push(newEntry);
  state.cart = []; // Clear the cart

  saveState();
  renderAll();
}

// Reset all unpaid entries (when payback occurs)
function resetUnpaid() {
  if (
    confirm(
      "Are you sure you want to reset all unpaid purchases? This will clear your entire history.",
    )
  ) {
    state.unpaidEntries = [];
    saveState();
    renderAll();
  }
}

// ==========================================
// 5. EVENT LISTENERS
// ==========================================

// Handle product creation form submit
addProductFormEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("new-product-name");
  const priceInput = document.getElementById("new-product-price");

  addProduct(nameInput.value, priceInput.value);

  // Clear inputs
  nameInput.value = "";
  priceInput.value = "";
  nameInput.focus();
});

// Handle Checkout button click
btnCheckoutEl.addEventListener("click", checkout);

// Handle Pay Back reset button click
btnPaybackEl.addEventListener("click", resetUnpaid);

// ==========================================
// 6. UTILITY FUNCTIONS
// ==========================================

// Prevent HTML injection from user inputs
function escapeHTML(str) {
  return str
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/'/g, "&#039;");
}

// ==========================================
// 7. INITIAL STARTUP
// ==========================================
renderAll();

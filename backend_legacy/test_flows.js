// REHLA E2E Operations Lifecycle Test Suite
// Verifies: Auth -> POS Checkout -> Warehouse Exit -> Delivery Assign -> Driver Delivered -> CEO Analytics Check

process.env.PORT = 5099; // Set separate port for testing
const { getDb } = require('./database');
require('./server'); // Spin up server

// Wait for server initialization
setTimeout(async () => {
  console.log("\n=============================================");
  console.log("   RUNNING REHLA E2E INTEGRATION TESTS       ");
  console.log("=============================================\n");

  const baseUrl = "http://localhost:5099";
  let workerToken, adminToken, driverToken, ceoToken;
  let driverUserId;
  let testOrderId, testInvoiceNumber, testDeliveryId;

  try {
    // 1. Authenticate Roles
    console.log("[TEST] Logins:");
    
    // Worker login
    const workerLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "worker@rehla.com", password: "rehla123" })
    }).then(res => res.json());
    if (!workerLogin.token) throw new Error("Worker login failed: " + JSON.stringify(workerLogin));
    workerToken = workerLogin.token;
    console.log("  ✓ Worker Authenticated");

    // Admin login
    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin@rehla.com", password: "rehla123" })
    }).then(res => res.json());
    if (!adminLogin.token) throw new Error("Admin login failed");
    adminToken = adminLogin.token;
    console.log("  ✓ Admin Authenticated");

    // Driver login
    const driverLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "driver@rehla.com", password: "rehla123" })
    }).then(res => res.json());
    if (!driverLogin.token) throw new Error("Driver login failed");
    driverToken = driverLogin.token;
    driverUserId = driverLogin.user.id;
    console.log("  ✓ Driver Authenticated (ID: " + driverUserId + ")");

    // CEO login
    const ceoLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ceo@rehla.com", password: "rehla123" })
    }).then(res => res.json());
    if (!ceoLogin.token) throw new Error("CEO login failed");
    ceoToken = ceoLogin.token;
    console.log("  ✓ CEO Authenticated");

    // 2. POS Checkout Simulation
    console.log("\n[TEST] POS Checkout & Stock Management:");
    const db = await getDb();
    
    // Get product ID 1 (Heavyweight Hoodie) stock level before sale
    const productBefore = await db.get("SELECT * FROM products WHERE id = 1");
    const stockBefore = productBefore.stock_quantity;
    console.log(`  Current stock of ${productBefore.name}: ${stockBefore}`);

    const checkoutResponse = await fetch(`${baseUrl}/api/pos/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        items: [{ id: 1, quantity: 2 }],
        payment_method: "cash",
        amount_received: 3000,
        customer_name: "Verification Customer",
        customer_phone: "+201009999999",
        delivery_address: "12 Test Verification Street, Maadi, Cairo"
      })
    }).then(res => res.json());

    if (!checkoutResponse.success) throw new Error("Checkout failed: " + JSON.stringify(checkoutResponse));
    testOrderId = checkoutResponse.order_id;
    testInvoiceNumber = checkoutResponse.invoice_number;
    console.log(`  ✓ POS Checkout succeeded. Order ID: ${testOrderId}, Invoice: ${testInvoiceNumber}, Total: EGP ${checkoutResponse.total}`);

    // Verify stock decremented by 2
    const productAfter = await db.get("SELECT * FROM products WHERE id = 1");
    const stockAfter = productAfter.stock_quantity;
    console.log(`  Updated stock: ${stockAfter}`);
    if (stockBefore - stockAfter !== 2) throw new Error("Stock was not decremented correctly!");
    console.log("  ✓ Stock correctly decremented by 2");

    // 3. Deliveries Dispatch Assignment
    console.log("\n[TEST] Delivery Dispatch & Assignment:");
    const deliveries = await fetch(`${baseUrl}/api/deliveries`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    }).then(res => res.json());

    const myDelivery = deliveries.find(d => d.order_id === testOrderId);
    if (!myDelivery) throw new Error("Delivery entry not created for the checkout order");
    testDeliveryId = myDelivery.id;
    console.log(`  Found pending delivery. ID: ${testDeliveryId}, Address: ${myDelivery.customer_address}`);

    const assignResponse = await fetch(`${baseUrl}/api/deliveries/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        delivery_id: testDeliveryId,
        driver_id: driverUserId
      })
    }).then(res => res.json());

    if (!assignResponse.success) throw new Error("Assignment failed: " + JSON.stringify(assignResponse));
    console.log("  ✓ Delivery assigned to Driver.");

    // 4. Driver Status Lifecycle Updates
    console.log("\n[TEST] Driver Delivery Lifecycle:");
    const driverDeliveries = await fetch(`${baseUrl}/api/deliveries`, {
      headers: { "Authorization": `Bearer ${driverToken}` }
    }).then(res => res.json());

    const driverDelivery = driverDeliveries.find(d => d.id === testDeliveryId);
    if (!driverDelivery || driverDelivery.status !== 'assigned') {
      throw new Error("Driver did not receive the assigned delivery, or status incorrect: " + JSON.stringify(driverDelivery));
    }
    console.log(`  Driver verified delivery is in queue. Current status: ${driverDelivery.status}`);

    // Start Journey
    const startJourney = await fetch(`${baseUrl}/api/deliveries/${testDeliveryId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${driverToken}`
      },
      body: JSON.stringify({ status: "journey_started", notes: "Leaving Zamalek warehouse." })
    }).then(res => res.json());
    if (!startJourney.success) throw new Error("Status update failed");
    console.log("  ✓ Driver marked: journey_started");

    // Mark Delivered
    const markDelivered = await fetch(`${baseUrl}/api/deliveries/${testDeliveryId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${driverToken}`
      },
      body: JSON.stringify({ status: "delivered", notes: "Delivered to customer directly. Received cash." })
    }).then(res => res.json());
    if (!markDelivered.success) throw new Error("Mark delivered failed");
    console.log("  ✓ Driver marked: delivered");

    // 5. CEO Financial Intelligence Check
    console.log("\n[TEST] CEO Financial Insights & AI Query:");
    const summary = await fetch(`${baseUrl}/api/analytics/summary`, {
      headers: { "Authorization": `Bearer ${ceoToken}` }
    }).then(res => res.json());
    console.log(`  Live Revenue KPI: EGP ${summary.revenue}`);
    console.log(`  Live Gross Profit KPI: EGP ${summary.grossProfit}`);

    const aiQuery = await fetch(`${baseUrl}/api/ai/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ceoToken}`
      },
      body: JSON.stringify({ query: "What is our revenue?" })
    }).then(res => res.json());

    console.log(`  AI Answer Title: "${aiQuery.title}"`);
    console.log(`  AI Answer Snippet: ${aiQuery.html.replace(/<\/?[^>]+(>|$)/g, "")}`);
    if (!aiQuery.html.includes("EGP")) throw new Error("AI query did not resolve financial variables.");
    console.log("  ✓ AI Query solved financial variables correctly.");

    // 6. Test Multiple Warehouses
    console.log("\n[TEST] Warehouse Management:");
    const createWhResponse = await fetch(`${baseUrl}/api/warehouses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        code: "WH-ALX",
        name: "Alexandria Port Hub",
        location: "Alexandria Port, Egypt"
      })
    }).then(res => res.json());

    if (!createWhResponse.code) throw new Error("Warehouse creation failed: " + JSON.stringify(createWhResponse));
    console.log("  ✓ Created new Warehouse: " + createWhResponse.name + " (" + createWhResponse.code + ")");

    // Get warehouses
    const warehouses = await fetch(`${baseUrl}/api/warehouses`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    }).then(res => res.json());

    const foundWh = warehouses.find(w => w.code === "WH-ALX");
    if (!foundWh) throw new Error("Could not find the newly created warehouse in /api/warehouses!");
    console.log("  ✓ Verified new Warehouse listed in database.");

    console.log("\n=============================================");
    console.log("          ALL TEST FLOWS PASSED              ");
    console.log("=============================================\n");
    process.exit(0);

  } catch (err) {
    console.error("\n❌ TEST FAILURE:", err.message);
    console.error(err);
    process.exit(1);
  }
}, 1000);

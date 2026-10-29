const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.on('error', (err, client) => {
    console.error('❌ Unexpected error on idle PostgreSQL client', err);
});

pool.connect()
    .then(() => console.log("Connected to PostgreSQL Database successfully!"))
    .catch(err => console.error("Database connection error:", err));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const initTables = async () => {
    const queryMaster = `
        CREATE TABLE IF NOT EXISTS master_items (
            id SERIAL PRIMARY KEY,
            type VARCHAR(50) DEFAULT 'EXPENSE',
            category VARCHAR(255) NOT NULL,
            item_name VARCHAR(255) NOT NULL,
            image_url TEXT,
            unit VARCHAR(50) DEFAULT 'ដុំ',
            stock_quantity INT DEFAULT 0,
            cost_price DECIMAL(10, 2) DEFAULT 0,
            retail_price DECIMAL(10, 2) DEFAULT 0,
            wholesale_price DECIMAL(10, 2) DEFAULT 0,
            barcode VARCHAR(100)
        );
    `;
    const queryTransactions = `
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            type VARCHAR(50) NOT NULL,
            item_id INT,
            category VARCHAR(255) NOT NULL,
            item_name VARCHAR(255) NOT NULL,
            quantity INT NOT NULL DEFAULT 1,
            unit_price DECIMAL(10, 2) NOT NULL,
            amount DECIMAL(10, 2) NOT NULL
        );
    `;
    const queryUsers = `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'staff',
            status VARCHAR(20) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    const queryInvoices = `
        CREATE TABLE IF NOT EXISTS invoices (
            id VARCHAR(100) PRIMARY KEY,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            table_info VARCHAR(100) DEFAULT 'ទូទៅ',
            items JSONB NOT NULL
        );
    `;
    const queryLogs = `
        CREATE TABLE IF NOT EXISTS activity_logs (
            id SERIAL PRIMARY KEY,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            username VARCHAR(100) NOT NULL,
            role VARCHAR(50) NOT NULL,
            action TEXT NOT NULL
        );
    `;
    const queryDebts = `
        CREATE TABLE IF NOT EXISTS debts (
            id SERIAL PRIMARY KEY,
            debt_type VARCHAR(20) NOT NULL,
            partner_name VARCHAR(255) NOT NULL,
            reference_id VARCHAR(100),
            total_amount DECIMAL(10, 2) NOT NULL,
            paid_amount DECIMAL(10, 2) DEFAULT 0,
            remaining_amount DECIMAL(10, 2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
            status VARCHAR(50) DEFAULT 'UNPAID',
            due_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    const queryDebtPayments = `
        CREATE TABLE IF NOT EXISTS debt_payments (
            id SERIAL PRIMARY KEY,
            debt_id INT REFERENCES debts(id) ON DELETE CASCADE,
            payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            paid_amount DECIMAL(10, 2) NOT NULL,
            note TEXT
        );
    `;
    const queryTables = `
        CREATE TABLE IF NOT EXISTS restaurant_tables (
            id SERIAL PRIMARY KEY,
            table_type VARCHAR(50) NOT NULL,
            table_name VARCHAR(100) UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    const queryQrOrders = `
        CREATE TABLE IF NOT EXISTS qr_orders (
            id VARCHAR(100) PRIMARY KEY,
            table_info VARCHAR(100) NOT NULL,
            items JSONB NOT NULL,
            status VARCHAR(50) DEFAULT 'PENDING',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    try {
        await pool.query(queryMaster);
        await pool.query(queryTransactions);
        await pool.query(queryUsers);
        await pool.query(queryInvoices);
        await pool.query(queryLogs);
        await pool.query(queryDebts);
        await pool.query(queryDebtPayments);
        await pool.query(queryTables);
        await pool.query(queryQrOrders);
        
        await pool.query(`ALTER TABLE master_items ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'EXPENSE';`);
        await pool.query(`ALTER TABLE master_items ADD COLUMN IF NOT EXISTS image_url TEXT;`);
        await pool.query(`ALTER TABLE master_items ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'ដុំ';`);
        await pool.query(`ALTER TABLE master_items ADD COLUMN IF NOT EXISTS stock_quantity INT DEFAULT 0;`);
        await pool.query(`ALTER TABLE master_items ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0;`);
        await pool.query(`ALTER TABLE master_items ADD COLUMN IF NOT EXISTS retail_price DECIMAL(10, 2) DEFAULT 0;`);
        await pool.query(`ALTER TABLE master_items ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(10, 2) DEFAULT 0;`);
        await pool.query(`ALTER TABLE master_items ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);`);
        await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS item_id INT;`);
        await pool.query(`ALTER TABLE debts ADD COLUMN IF NOT EXISTS due_date TIMESTAMP;`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';`);
        await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS table_info VARCHAR(100) DEFAULT 'ទូទៅ';`);

        await pool.query(`
            INSERT INTO users (username, password, role, status) 
            VALUES ('admin', '123', 'admin', 'active')
            ON CONFLICT (username) DO NOTHING;
        `);

        await pool.query(`
            INSERT INTO restaurant_tables (table_type, table_name) VALUES
            ('TABLE', 'តុទី ១'), ('TABLE', 'តុទី ២'), ('TABLE', 'តុទី ៣'), ('TABLE', 'តុទី ៤'),
            ('VIP', 'បន្ទប់ VIP 01'), ('VIP', 'បន្ទប់ VIP 02'), ('VIP', 'បន្ទប់ VIP 03')
            ON CONFLICT (table_name) DO NOTHING;
        `);

        console.log("Database tables and columns are ready and safe.");
    } catch (err) {
        console.error("Error creating/updating tables:", err);
    }
};
initTables();

// RESTAURANT TABLES API
app.get('/api/accounting/tables', async (req, res) => {
    try {
        let result = await pool.query('SELECT * FROM restaurant_tables ORDER BY id ASC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/accounting/tables', async (req, res) => {
    try {
        const { table_type, table_name } = req.body;
        let result = await pool.query(
            'INSERT INTO restaurant_tables (table_type, table_name) VALUES ($1, $2) ON CONFLICT (table_name) DO NOTHING RETURNING *;',
            [table_type || 'TABLE', table_name]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// AUTH & USERS API
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.status(401).json({ success: false, error: 'ឈ្មោះអ្នកប្រើប្រាស់ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ!' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, role, status, created_at FROM users ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { username, password, role, status } = req.body;
        const result = await pool.query(
            'INSERT INTO users (username, password, role, status) VALUES ($1, $2, $3, $4) RETURNING id, username, role, status',
            [username, password, role || 'staff', status || 'active']
        );
        res.status(201).json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.put('/api/users/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE users SET status = $1 WHERE id = $2 RETURNING id, username, role, status',
            [status, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'រកមិនឃើញ User នេះទេ' });
        }
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ success: true, message: 'Deleted user successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =========================================================================
// CUSTOMER ORDERS API - ទទួលការកុម្ម៉ង់ពីភ្ញៀវតាម QR Code (Smart Merge + Alert)
// =========================================================================

async function processOrderSubmission(table_info, items, res) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (!items || !Array.isArray(items) || items.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'គ្មានទំនិញក្នុង Order ទេ!' });
        }

        const tableInfo = table_info ? table_info.trim() : 'ទូទៅ';
        const qrOrderId = 'QRO-' + Date.now();

        // 1. រក្សាទុកចូល qr_orders ក្នុង Database ជា PENDING
        await client.query(
            'INSERT INTO qr_orders (id, table_info, items, status) VALUES ($1, $2, $3, $4)',
            [qrOrderId, tableInfo, JSON.stringify(items), 'PENDING']
        );

        // 2. ឆែករក Invoice ចាស់ (ប្រើ LOWER និង TRIM ដើម្បីការពារករណី table_info ផ្ញើមកអក្សរតូច/ធំ ឬមានដកឃ្លាខុសគ្នា)
       // 2. ឆែករក Invoice ចាស់ (យើងដូរមកទាញយក Invoice ចុងក្រោយបង្អស់ដែលបង្កើតឡើងក្នុងថ្ងៃជាមួយគ្នា សម្រាប់តុហ្នឹង)
       // ឆែករក Invoice ចាស់របស់តុនេះដែលបង្កើតឡើងក្នុងថ្ងៃជាមួយគ្នា (Smart Merge)
        let existingInvoiceRes = await client.query(
            `SELECT * FROM invoices 
             WHERE LOWER(TRIM(table_info)) = LOWER(TRIM($1)) 
             AND date >= CURRENT_DATE
             ORDER BY date DESC LIMIT 1`,
            [tableInfo]
        );
        let invoiceId;
        let finalItems = [];

        if (existingInvoiceRes.rows.length > 0) {
            // បើមាន Invoice របស់តុហ្នឹងរួចហើយ -> យកមកបូកបញ្ចូលគ្នា
            let oldInvoice = existingInvoiceRes.rows[0];
            let oldItems = typeof oldInvoice.items === 'string' ? JSON.parse(oldInvoice.items) : (oldInvoice.items || []);
            
            invoiceId = oldInvoice.id;
            finalItems = [...oldItems];

            items.forEach(newItem => {
                let existingItemIndex = finalItems.findIndex(i => i.item_name === newItem.item_name && parseFloat(i.unit_price) === parseFloat(newItem.unit_price));
                if (existingItemIndex > -1) {
                    finalItems[existingItemIndex].quantity = parseInt(finalItems[existingItemIndex].quantity) + (parseInt(newItem.quantity) || 1);
                } else {
                    finalItems.push({
                        item_id: newItem.item_id || null,
                        category: newItem.category || 'General',
                        item_name: newItem.item_name,
                        unit: newItem.unit || 'ដុំ',
                        quantity: parseInt(newItem.quantity) || 1,
                        unit_price: parseFloat(newItem.unit_price) || 0
                    });
                }
            });
        } else {
            // បើគ្មាន Invoice ទេ -> បង្កើត Invoice ID ថ្មី
            invoiceId = 'INV-QR-' + Date.now();
            finalItems = items.map(i => ({
                item_id: i.item_id || null,
                category: i.category || 'General',
                item_name: i.item_name,
                unit: i.unit || 'ដុំ',
                quantity: parseInt(i.quantity) || 1,
                unit_price: parseFloat(i.unit_price) || 0
            }));
        }

        // 3. រក្សាទុក ឬ Update ចូលក្នុង Table invoices ក្រោម ID តែមួយ
        await client.query(
            'INSERT INTO invoices (id, date, table_info, items) VALUES ($1, NOW(), $2, $3) ON CONFLICT (id) DO UPDATE SET items = $3, table_info = $2',
            [invoiceId, tableInfo, JSON.stringify(finalItems)]
        );

        // 4. កត់ត្រាចូល transactions និងកាត់ស្តុកសម្រាប់តែទំនិញថ្មី
        for (let item of items) {
            let qty = parseInt(item.quantity) || 1;
            let price = parseFloat(item.unit_price) || 0;
            let totalAmount = qty * price;

            await client.query(
                `INSERT INTO transactions (type, item_id, category, item_name, quantity, unit_price, amount)
                 VALUES ('INCOME', $1, $2, $3, $4, $5, $6)`,
                [item.item_id || null, item.category || 'General', item.item_name, qty, price, totalAmount]
            );

            if (item.item_id) {
                await client.query(
                    `UPDATE master_items SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
                    [qty, item.item_id]
                );
            }
        }

        // 5. កត់ត្រា Activity Logs
        await client.query(
            'INSERT INTO activity_logs (username, role, action) VALUES ($1, $2, $3)',
            ['Customer-QR', 'CUSTOMER', `ភ្ញៀវកុម្ម៉ង់តាម QR Code (តុ: ${tableInfo} - វិក្កយបត្រ: ${invoiceId})`]
        );

        await client.query('COMMIT');
        res.status(201).json({ 
            success: true, 
            message: 'Order បញ្ជូនជោគជ័យ!', 
            invoice_id: invoiceId,
            qr_order_id: qrOrderId
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error processing customer QR order:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
}

// Support ទាំងពីរ Endpoints
app.post('/api/customer-orders', async (req, res) => {
    await processOrderSubmission(req.body.table_info, req.body.items, res);
});

app.post('/api/accounting/qr-orders', async (req, res) => {
    await processOrderSubmission(req.body.table_info, req.body.items, res);
});

// QR ORDERS PENDING & ACCEPT/REJECT API
app.get('/api/accounting/qr-orders/pending', async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM qr_orders WHERE status = 'PENDING' ORDER BY created_at ASC");
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/accounting/qr-orders/:id/accept', async (req, res) => {
    try {
        let orderId = req.params.id;
        let result = await pool.query(
            "UPDATE qr_orders SET status = 'ACCEPTED' WHERE id = $1 RETURNING *",
            [orderId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'រកមិនឃើញការកុម្ម៉ង់នេះទេ' });
        }

        res.json({ success: true, message: 'បានទទួលយកការកុម្ម៉ង់ជោគជ័យ', data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/accounting/qr-orders/:id/reject', async (req, res) => {
    try {
        let orderId = req.params.id;
        await pool.query("UPDATE qr_orders SET status = 'REJECTED' WHERE id = $1", [orderId]);
        res.json({ success: true, message: 'បានបដិសេធការកុម្ម៉ង់រៀបរយ' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// INVOICES API
app.get('/api/accounting/invoices', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM invoices ORDER BY date DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/accounting/invoices', async (req, res) => {
    try {
        const { id, date, table_info, items } = req.body;
        await pool.query(
            'INSERT INTO invoices (id, date, table_info, items) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET items = $4, date = $2, table_info = $3',
            [id, date || new Date(), table_info || 'ទូទៅ', JSON.stringify(items)]
        );
        res.json({ success: true, message: 'Saved invoice successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/accounting/invoices/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
        res.json({ success: true, message: 'Deleted invoice successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ACTIVITY LOGS API
app.get('/api/activity-logs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM activity_logs ORDER BY date DESC LIMIT 200');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/activity-logs', async (req, res) => {
    try {
        const { username, role, action } = req.body;
        await pool.query(
            'INSERT INTO activity_logs (username, role, action) VALUES ($1, $2, $3)',
            [username, role, action]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// MASTER ITEMS API
app.get('/api/accounting/master-items', async (req, res) => {
    try {
        let result = await pool.query('SELECT * FROM master_items ORDER BY category, item_name ASC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/accounting/master-items', async (req, res) => {
    try {
        let { type, category, item_name, image_url, unit, stock_quantity, cost_price, retail_price, wholesale_price, barcode } = req.body;
        const formattedType = (type && type.trim() !== '') ? type.toUpperCase() : 'EXPENSE';
        const itemUnit = (unit && unit.trim() !== '') ? unit : 'ដុំ';

        const query = `
            INSERT INTO master_items (type, category, item_name, image_url, unit, stock_quantity, cost_price, retail_price, wholesale_price, barcode)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *;
        `;
        let result = await pool.query(query, [
            formattedType, category, item_name, image_url || '', itemUnit,
            stock_quantity || 0, cost_price || 0, retail_price || 0, wholesale_price || 0, barcode || ''
        ]);
        
        res.status(201).json({ success: true, message: "Master item added successfully!", data: result.rows[0] });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.put('/api/accounting/master-items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let { category, item_name, image_url, unit, stock_quantity, cost_price, retail_price, wholesale_price, barcode } = req.body;
        const itemUnit = (unit && unit.trim() !== '') ? unit : 'ដុំ';

        const query = `
            UPDATE master_items 
            SET category = $1, item_name = $2, image_url = $3, unit = $4, stock_quantity = $5, cost_price = $6, retail_price = $7, wholesale_price = $8, barcode = $9
            WHERE id = $10 RETURNING *;
        `;
        let result = await pool.query(query, [
            category, item_name, image_url || '', itemUnit, stock_quantity || 0, 
            cost_price || 0, retail_price || 0, wholesale_price || 0, barcode || '', id
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Master item not found!" });
        }

        res.json({ success: true, message: "Master item updated successfully!", data: result.rows[0] });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.delete('/api/accounting/master-items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM master_items WHERE id = $1', [id]);
        res.json({ success: true, message: "Master item deleted successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// TRANSACTIONS API
app.get('/api/accounting/transactions', async (req, res) => {
    try {
        let result = await pool.query('SELECT * FROM transactions ORDER BY date DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/accounting/transactions', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { type, item_id, category, item_name, quantity, unit_price } = req.body;
        const formattedType = type ? type.toUpperCase() : 'INCOME';
        const qty = parseInt(quantity) || 1;
        const price = parseFloat(unit_price) || 0;
        const totalAmount = qty * price;

        const insertQuery = `
            INSERT INTO transactions (type, item_id, category, item_name, quantity, unit_price, amount)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;
        `;
        let result = await client.query(insertQuery, [formattedType, item_id, category, item_name, qty, price, totalAmount]);

        if (item_id) {
            if (formattedType === 'INCOME') {
                await client.query(`UPDATE master_items SET stock_quantity = stock_quantity - $1 WHERE id = $2`, [qty, item_id]);
            } else if (formattedType === 'EXPENSE') {
                let masterRes = await client.query(`SELECT stock_quantity, cost_price FROM master_items WHERE id = $1`, [item_id]);
                
                if (masterRes.rows.length > 0) {
                    let item = masterRes.rows[0];
                    let oldStock = parseInt(item.stock_quantity) || 0;
                    let oldCostPrice = parseFloat(item.cost_price) || 0;
                    let newStock = oldStock + qty;
                    let newCostPrice = oldCostPrice;

                    if (newStock > 0) {
                        newCostPrice = ((oldStock * oldCostPrice) + (qty * price)) / newStock;
                    }

                    await client.query(
                        `UPDATE master_items SET stock_quantity = $1, cost_price = $2 WHERE id = $3`,
                        [newStock, newCostPrice, item_id]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

app.put('/api/accounting/transactions/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        const { category, item_name, quantity, unit_price } = req.body;
        
        let oldTxData = await client.query('SELECT * FROM transactions WHERE id = $1', [id]);
        if (oldTxData.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: "Transaction not found!" });
        }
        let oldTx = oldTxData.rows[0];

        const qty = parseInt(quantity) || 1;
        const price = parseFloat(unit_price) || 0;
        const totalAmount = qty * price;

        if (oldTx.item_id) {
            if (oldTx.type === 'INCOME') {
                await client.query(`UPDATE master_items SET stock_quantity = stock_quantity + $1 WHERE id = $2`, [oldTx.quantity, oldTx.item_id]);
            } else if (oldTx.type === 'EXPENSE') {
                await client.query(`UPDATE master_items SET stock_quantity = stock_quantity - $1 WHERE id = $2`, [oldTx.quantity, oldTx.item_id]);
            }
        }

        if (oldTx.item_id) {
            if (oldTx.type === 'INCOME') {
                await client.query(`UPDATE master_items SET stock_quantity = stock_quantity - $1 WHERE id = $2`, [qty, oldTx.item_id]);
            } else if (oldTx.type === 'EXPENSE') {
                await client.query(`UPDATE master_items SET stock_quantity = stock_quantity + $1 WHERE id = $2`, [qty, oldTx.item_id]);
            }
        }

        const updateQuery = `
            UPDATE transactions 
            SET category = $1, item_name = $2, quantity = $3, unit_price = $4, amount = $5
            WHERE id = $6 RETURNING *;
        `;
        let result = await client.query(updateQuery, [category, item_name, qty, price, totalAmount, id]);

        await client.query('COMMIT');
        res.json({ success: true, message: "Transaction updated successfully!", data: result.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

app.delete('/api/accounting/transactions/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        await client.query('DELETE FROM transactions WHERE id = $1', [id]);
        await client.query('COMMIT');
        res.json({ success: true, message: "Transaction deleted successfully!" });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// DEBTS API
app.get('/api/accounting/debts', async (req, res) => {
    try {
        const { debt_type } = req.query;
        let query = 'SELECT * FROM debts';
        let params = [];
        
        if (debt_type) {
            query += ' WHERE debt_type = $1';
            params.push(debt_type.toUpperCase());
        }
        query += ' ORDER BY created_at DESC';

        let result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/accounting/debts', async (req, res) => {
    try {
        const { debt_type, partner_name, reference_id, total_amount, due_date } = req.body;
        const type = debt_type ? debt_type.toUpperCase() : 'RECEIVABLE';
        const total = parseFloat(total_amount) || 0;

        const query = `
            INSERT INTO debts (debt_type, partner_name, reference_id, total_amount, paid_amount, status, due_date)
            VALUES ($1, $2, $3, $4, 0, 'UNPAID', $5) RETURNING *;
        `;
        let result = await pool.query(query, [type, partner_name, reference_id || '', total, due_date || null]);
        
        res.status(201).json({ success: true, message: "Debt record created successfully!", data: result.rows[0] });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/accounting/debts/:id/pay', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        const { paid_amount, note } = req.body;
        const payAmount = parseFloat(paid_amount) || 0;

        let debtRes = await client.query('SELECT * FROM debts WHERE id = $1', [id]);
        if (debtRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: "Debt record not found!" });
        }

        let debt = debtRes.rows[0];
        let newPaidAmount = parseFloat(debt.paid_amount) + payAmount;
        let totalAmt = parseFloat(debt.total_amount);
        let newStatus = newPaidAmount >= totalAmt ? 'PAID' : 'PARTIAL';

        await client.query(
            'INSERT INTO debt_payments (debt_id, paid_amount, note) VALUES ($1, $2, $3)',
            [id, payAmount, note || '']
        );

        let updateRes = await client.query(
            `UPDATE debts SET paid_amount = $1, status = $2 WHERE id = $3 RETURNING *;`,
            [newPaidAmount, newStatus, id]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: "Payment recorded successfully!", data: updateRes.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

app.delete('/api/accounting/debts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM debts WHERE id = $1', [id]);
        res.json({ success: true, message: "Debt record deleted successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// SUMMARY API
app.get('/api/accounting/summary', async (req, res) => {
    try {
        let txResult = await pool.query("SELECT * FROM transactions WHERE type = 'INCOME'");
        let masterResult = await pool.query("SELECT * FROM master_items");
        
        let totalIncome = 0;
        let totalProfit = 0;
        let costPriceMap = {};

        masterResult.rows.forEach(m => {
            costPriceMap[m.id] = parseFloat(m.cost_price) || 0;
        });

        txResult.rows.forEach(tx => {
            let incomeAmt = parseFloat(tx.amount) || 0;
            totalIncome += incomeAmt;

            let costPrice = costPriceMap[tx.item_id] || 0;
            let profitPerUnit = parseFloat(tx.unit_price) - costPrice;
            totalProfit += (profitPerUnit * tx.quantity);
        });

        let totalInventoryValue = 0;
        masterResult.rows.forEach(m => {
            totalInventoryValue += (parseInt(m.stock_quantity) * parseFloat(m.cost_price));
        });

        res.json({
            success: true,
            summary: {
                total_income: totalIncome,
                total_purchase_value: totalInventoryValue,
                net_profit: totalProfit
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Accounting API Server is running on port ${PORT}`);
});

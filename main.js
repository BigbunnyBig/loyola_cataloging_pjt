const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000; // API 서버 포트 설정

// DB 접속 정보 (Provided by user)
const pool = new Pool({
    user: 'root',
    host: 'svc.sel3.cloudtype.app',
    database: 'database',
    password: '7487',
    port: 31375,
    ssl: false // User specified ssl: false
});

// Middleware
app.use(cors()); // CORS 허용
app.use(express.json()); // Body-parser for JSON data
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '.'))); // Serve static files from root

// --- KST Date Utilities ---
/**
 * 현재 KST (한국 표준시) Date 객체를 반환합니다. (UTC+9)
 * @param {Date} date - 변환할 Date 객체 (기본값: 현재 시각)
 * @returns {Date} KST Date 객체
 */
function getKstDate(date = new Date()) {
    const kstOffset = 9 * 60; // KST is UTC+9 in minutes
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    return new Date(utc + (kstOffset * 60000));
}

/**
 * 기간 문자열에 따른 KST 기준 시작일과 종료일 범위를 계산합니다.
 * @param {string} period - '금주', '전주', '금월', '전월', '금년', '전년', '3일전'
 * @returns {{startDate: string, endDate: string, displayStart: string, displayEnd: string}} SQL 및 표시용 날짜 문자열
 */
function getDateRange(period) {
    const today = getKstDate();
    const start = new Date(today);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    switch (period) {
        case '금주': // Current Week (Mon to Sun)
            start.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
            start.setHours(0, 0, 0, 0);
            break;
        case '전주': // Last Week (Mon to Sun)
            start.setDate(today.getDate() - today.getDay() - 6);
            end.setDate(today.getDate() - today.getDay());
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            break;
        case '금월': // Current Month
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            break;
        case '전월': // Last Month
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            start.setMonth(start.getMonth() - 1);
            end.setDate(0);
            end.setHours(23, 59, 59, 999);
            break;
        case '금년': // Current Year
            start.setMonth(0, 1);
            start.setHours(0, 0, 0, 0);
            break;
        case '전년': // Last Year
            start.setFullYear(today.getFullYear() - 1, 0, 1);
            start.setHours(0, 0, 0, 0);
            end.setFullYear(today.getFullYear() - 1, 11, 31);
            end.setHours(23, 59, 59, 999);
            break;
        case '3일전': // Today - 3 days (for Guest initial load)
            start.setDate(today.getDate() - 3);
            start.setHours(0, 0, 0, 0);
            break;
        default:
            // Default: today (금일)
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            break;
    }

    // Helper to format date for PostgreSQL (TIMESTAMP WITHOUT TIME ZONE)
    const formatSqlDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
    };

    // Helper to format date for Display (YYYY/MM/DD)
    const formatDateOnly = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}/${m}/${d}`;
    };

    return {
        startDate: formatSqlDate(start),
        endDate: formatSqlDate(end),
        displayStart: formatDateOnly(start),
        displayEnd: formatDateOnly(end)
    };
}
// --- KST Date Utilities End ---

// 4-4) Root URL Redirection
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 4-5-2) Admin Password Check API
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'adminloyola') {
        res.json({ success: true, message: 'Admin login successful.' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid password.' });
    }
});

// --- API Router: Catalog (CRUD) ---

// 6) & 10) Insert New Record
app.post('/api/catalog', async (req, res) => {
    const { region, worker, w_date, new_species, new_bookcount, rearray_species, rearray_bookcount, multipart_species, multipart_bookcount, edit_bookcount, authority_bookcount, update_user } = req.body;
    
    // Convert client-provided w_date (YYYY-MM-DD string) and server-set update_date to KST for DB
    const workDate = `${w_date} 00:00:00`; // Time is ignored in input, but DB requires TIMESTAMP. Assuming input date is start of day KST.
    const updateDate = getDateRange('today').startDate; // Use a precise KST timestamp for update_date

    const queryText = `
        INSERT INTO public.loyola_cataloging (
            region, worker, w_date, new_species, new_bookcount, rearray_species, rearray_bookcount, 
            multipart_species, multipart_bookcount, edit_bookcount, authority_bookcount, update_date, update_user
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) RETURNING *;
    `;
    const values = [
        region, worker, workDate, new_species || '0', new_bookcount || '0', rearray_species || '0', rearray_bookcount || '0',
        multipart_species || '0', multipart_bookcount || '0', edit_bookcount || '0', authority_bookcount || '0', updateDate, update_user
    ];

    try {
        const result = await pool.query(queryText, values);
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error inserting data:', error);
        res.status(500).json({ success: false, message: 'Database insert failed', error: error.message });
    }
});

// 7) & 11) Update Record
app.put('/api/catalog/:id', async (req, res) => {
    const id = req.params.id;
    const { region, worker, w_date, new_species, new_bookcount, rearray_species, rearray_bookcount, multipart_species, multipart_bookcount, edit_bookcount, authority_bookcount, update_user } = req.body;
    
    // Set update_date to current KST
    const updateDate = getDateRange('today').startDate;
    const workDate = `${w_date} 00:00:00`;

    const queryText = `
        UPDATE public.loyola_cataloging SET
            region = $1, worker = $2, w_date = $3, new_species = $4, new_bookcount = $5, rearray_species = $6, rearray_bookcount = $7,
            multipart_species = $8, multipart_bookcount = $9, edit_bookcount = $10, authority_bookcount = $11, update_date = $12, update_user = $13
        WHERE id = $14
        RETURNING *;
    `;
    const values = [
        region, worker, workDate, new_species || '0', new_bookcount || '0', rearray_species || '0', rearray_bookcount || '0',
        multipart_species || '0', multipart_bookcount || '0', edit_bookcount || '0', authority_bookcount || '0', updateDate, update_user, id
    ];

    try {
        const result = await pool.query(queryText, values);
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Record not found.' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error updating data:', error);
        res.status(500).json({ success: false, message: 'Database update failed', error: error.message });
    }
});

// 7) & 11) Delete Record
app.delete('/api/catalog/:id', async (req, res) => {
    const id = req.params.id;

    const queryText = `DELETE FROM public.loyola_cataloging WHERE id = $1;`;

    try {
        const result = await pool.query(queryText, [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Record not found.' });
        }
        res.json({ success: true, message: 'Record deleted successfully.' });
    } catch (error) {
        console.error('Error deleting data:', error);
        res.status(500).json({ success: false, message: 'Database delete failed', error: error.message });
    }
});

// 7) & 11) List/Query Records with Pagination
app.get('/api/catalog', async (req, res) => {
    let { page = 1, limit = 10, period = '3일전', startDate, endDate } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // If startDate/endDate are not explicitly provided, calculate based on period
    let dateRange;
    if (!startDate || !endDate) {
        dateRange = getDateRange(period);
        startDate = dateRange.startDate;
        endDate = dateRange.endDate;
    }

    const offset = (page - 1) * limit;

    const queryText = `
        SELECT id, region, worker, 
               TO_CHAR(w_date, 'YYYY-MM-DD HH24:MI:SS') as w_date, 
               new_species, new_bookcount, rearray_species, rearray_bookcount, 
               multipart_species, multipart_bookcount, edit_bookcount, authority_bookcount, 
               TO_CHAR(update_date, 'YYYY-MM-DD HH24:MI:SS') as update_date, update_user 
        FROM public.loyola_cataloging
        WHERE w_date BETWEEN $1::timestamp AND $2::timestamp
        ORDER BY w_date DESC, id DESC
        LIMIT $3 OFFSET $4;
    `;
    
    const countQuery = `
        SELECT COUNT(*) FROM public.loyola_cataloging
        WHERE w_date BETWEEN $1::timestamp AND $2::timestamp;
    `;

    try {
        const countResult = await pool.query(countQuery, [startDate, endDate]);
        const totalCount = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.ceil(totalCount / limit);

        const dataResult = await pool.query(queryText, [startDate, endDate, limit, offset]);
        
        res.json({
            success: true,
            data: dataResult.rows,
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                limit
            }
        });

    } catch (error) {
        console.error('Error querying data:', error);
        res.status(500).json({ success: false, message: 'Database query failed', error: error.message });
    }
});

// 9) Statistics and Download Data (Raw data is just a full list for the period)
app.get('/api/catalog/stats', async (req, res) => {
    const { period = '금주', region = '국내외 합산' } = req.query;
    
    const dateRange = getDateRange(period);
    const startDate = dateRange.startDate;
    const endDate = dateRange.endDate;

    let regionFilter = '';
    const queryParams = [startDate, endDate];
    
    if (region === '국내' || region === '국외') {
        regionFilter = 'AND region = $3';
        queryParams.push(region);
    }
    
    // Columns to SUM
    const sumColumns = ['new_species', 'new_bookcount', 'rearray_species', 'rearray_bookcount', 'multipart_species', 'multipart_bookcount', 'edit_bookcount', 'authority_bookcount'];
    const sumSelect = sumColumns.map(col => `SUM(CAST(${col} AS INTEGER)) AS ${col}_sum`).join(', ');

    const statsQuery = `
        SELECT ${sumSelect}
        FROM public.loyola_cataloging
        WHERE w_date BETWEEN $1::timestamp AND $2::timestamp
        ${regionFilter};
    `;

    // Raw data query for download/synchronization (no limit/offset)
    const rawDataQuery = `
        SELECT id, region, worker, 
               TO_CHAR(w_date, 'YYYY-MM-DD HH24:MI:SS') as w_date, 
               new_species, new_bookcount, rearray_species, rearray_bookcount, 
               multipart_species, multipart_bookcount, edit_bookcount, authority_bookcount, 
               TO_CHAR(update_date, 'YYYY-MM-DD HH24:MI:SS') as update_date, update_user 
        FROM public.loyola_cataloging
        WHERE w_date BETWEEN $1::timestamp AND $2::timestamp
        ${regionFilter}
        ORDER BY w_date DESC, id DESC;
    `;

    try {
        const statsResult = await pool.query(statsQuery, queryParams);
        const rawDataResult = await pool.query(rawDataQuery, queryParams);

        res.json({
            success: true,
            stats: statsResult.rows[0] || {},
            rawData: rawDataResult.rows,
            dateRange: {
                start: dateRange.displayStart,
                end: dateRange.displayEnd
            }
        });
    } catch (error) {
        console.error('Error querying stats:', error);
        res.status(500).json({ success: false, message: 'Database stats query failed', error: error.message });
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

(function () {
  function getData(name) {
    try {
      if (Array.isArray(window[name])) return window[name];

      const local = localStorage.getItem(name);
      if (local) {
        const parsed = JSON.parse(local);
        return Array.isArray(parsed) ? parsed : [];
      }

      return [];
    } catch (e) {
      return [];
    }
  }

  function createAIBox() {
    if (document.getElementById('warehouseAiBox')) return;

    const box = document.createElement('div');
    box.id = 'warehouseAiBox';
    box.innerHTML = `
      <div style="
        position:fixed;
        right:16px;
        bottom:16px;
        width:360px;
        max-width:calc(100vw - 32px);
        background:#fff;
        border:1px solid #ddd;
        border-radius:12px;
        box-shadow:0 4px 20px rgba(0,0,0,.18);
        z-index:99999;
        font-family:Arial,sans-serif;
        overflow:hidden;
      ">
        <div style="
          background:#0f766e;
          color:white;
          padding:12px;
          font-weight:bold;
          display:flex;
          justify-content:space-between;
          align-items:center;
        ">
          <span>Trợ lý AI kho hàng</span>
          <button id="warehouseAiToggle" style="
            background:white;
            color:#0f766e;
            border:0;
            border-radius:6px;
            padding:4px 8px;
            cursor:pointer;
          ">Ẩn</button>
        </div>

        <div id="warehouseAiContent" style="padding:12px;">
          <div id="warehouseAiAnswer" style="
            min-height:90px;
            max-height:260px;
            overflow:auto;
            background:#f8fafc;
            border:1px solid #e5e7eb;
            border-radius:8px;
            padding:10px;
            font-size:14px;
            white-space:pre-wrap;
            margin-bottom:10px;
          ">Anh có thể hỏi: Hôm nay bán được bao nhiêu? Khách nào còn nợ nhiều nhất? Sản phẩm nào tồn thấp?</div>

          <textarea id="warehouseAiQuestion" placeholder="Nhập câu hỏi..." style="
            width:100%;
            height:70px;
            resize:none;
            border:1px solid #ddd;
            border-radius:8px;
            padding:8px;
            box-sizing:border-box;
            font-size:14px;
          "></textarea>

          <button id="warehouseAiAskBtn" style="
            width:100%;
            margin-top:8px;
            background:#0f766e;
            color:white;
            border:0;
            border-radius:8px;
            padding:10px;
            font-weight:bold;
            cursor:pointer;
          ">Hỏi AI</button>
        </div>
      </div>
    `;

    document.body.appendChild(box);

    document.getElementById('warehouseAiToggle').onclick = function () {
      const content = document.getElementById('warehouseAiContent');
      const btn = document.getElementById('warehouseAiToggle');

      if (content.style.display === 'none') {
        content.style.display = 'block';
        btn.innerText = 'Ẩn';
      } else {
        content.style.display = 'none';
        btn.innerText = 'Hiện';
      }
    };

    document.getElementById('warehouseAiAskBtn').onclick = askWarehouseAI;
  }

  async function askWarehouseAI() {
    const questionEl = document.getElementById('warehouseAiQuestion');
    const answerEl = document.getElementById('warehouseAiAnswer');
    const btn = document.getElementById('warehouseAiAskBtn');

    const question = questionEl.value.trim();

    if (!question) {
      answerEl.innerText = 'Anh chưa nhập câu hỏi.';
      return;
    }

    const data = {
      products: getData('products'),
      customers: getData('customers'),
      orders: getData('orders'),
      debts: getData('debts'),
      employees: getData('employees'),
      inventory: getData('inventory'),
      deliveries: getData('deliveries'),
      payments: getData('payments'),
      promotions: getData('promotions')
    };

    try {
      btn.disabled = true;
      btn.innerText = 'Đang hỏi AI...';
      answerEl.innerText = 'Đang phân tích dữ liệu...';

      // Ưu tiên dùng API_BASE cấu hình sẵn nếu có.
      // Nếu app chạy cùng domain với server thì để rỗng vẫn dùng /api/ai/ask.
      // Nếu frontend chạy Netlify còn server chạy Render, đặt:
      // window.WAREHOUSE_API_BASE = 'https://ten-server-cua-anh.onrender.com';
      const API_BASE = (window.WAREHOUSE_API_BASE || localStorage.getItem('WAREHOUSE_API_BASE') || '').replace(/\/$/, '');
      const apiUrl = API_BASE ? (API_BASE + '/api/ai/ask') : '/api/ai/ask';

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question,
          data
        })
      });

      const text = await res.text();
      let json;

      try {
        json = text ? JSON.parse(text) : null;
      } catch (e) {
        throw new Error('Server không trả về JSON. Kiểm tra lại link Render/API: ' + apiUrl);
      }

      if (!res.ok) {
        throw new Error((json && json.message) || ('Lỗi server: HTTP ' + res.status));
      }

      if (!json || !json.success) {
        throw new Error((json && json.message) || 'Lỗi hỏi AI');
      }

      answerEl.innerText = json.answer || 'Không có câu trả lời.';
    } catch (err) {
      answerEl.innerText = 'Lỗi: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.innerText = 'Hỏi AI';
    }
  }

  document.addEventListener('DOMContentLoaded', createAIBox);
})();

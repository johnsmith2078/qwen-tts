/**
 * Qwen-TTS 浏览器扩展 - Popup 脚本
 */

document.addEventListener('DOMContentLoaded', async () => {
    const enabledToggle = document.getElementById('enabledToggle');
    const serverUrlInput = document.getElementById('serverUrl');
    const voiceSelect = document.getElementById('voiceSelect');
    const saveBtn = document.getElementById('saveBtn');
    const testBtn = document.getElementById('testBtn');
    const statusEl = document.getElementById('status');

    // 加载已保存的设置
    const settings = await chrome.storage.sync.get(['enabled', 'serverUrl', 'voice']);

    enabledToggle.checked = settings.enabled !== false;
    serverUrlInput.value = settings.serverUrl || 'http://localhost:8000';
    voiceSelect.value = settings.voice || 'Cherry';

    // 动态加载音色列表
    loadVoices(serverUrlInput.value);

    // 保存设置
    saveBtn.addEventListener('click', async () => {
        const serverUrl = serverUrlInput.value.trim().replace(/\/$/, '');

        if (!serverUrl) {
            showStatus('请输入服务器地址', 'error');
            return;
        }

        try {
            await chrome.storage.sync.set({
                enabled: enabledToggle.checked,
                serverUrl: serverUrl,
                voice: voiceSelect.value
            });
            showStatus('设置已保存', 'success');
        } catch (e) {
            showStatus('保存失败: ' + e.message, 'error');
        }
    });

    // 测试连接
    testBtn.addEventListener('click', async () => {
        const serverUrl = serverUrlInput.value.trim().replace(/\/$/, '');

        if (!serverUrl) {
            showStatus('请输入服务器地址', 'error');
            return;
        }

        showStatus('正在测试连接...', 'info');

        try {
            const response = await fetch(`${serverUrl}/api/health`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.status === 'healthy') {
                    showStatus('连接成功！服务运行正常', 'success');
                    // 加载音色列表
                    loadVoices(serverUrl);
                } else {
                    showStatus('服务状态异常', 'error');
                }
            } else {
                showStatus(`连接失败: HTTP ${response.status}`, 'error');
            }
        } catch (e) {
            showStatus('连接失败: ' + e.message, 'error');
        }
    });

    // 加载音色列表
    async function loadVoices(serverUrl) {
        try {
            const response = await fetch(`${serverUrl}/api/voices`);
            if (response.ok) {
                const data = await response.json();
                const voices = data.voices;

                // 保存当前选中值
                const currentValue = voiceSelect.value;

                // 清空并重新填充
                voiceSelect.innerHTML = '';

                for (const [key, info] of Object.entries(voices)) {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = `${info.name} - ${info.description}`;
                    voiceSelect.appendChild(option);
                }

                // 恢复选中值
                if (currentValue && voices[currentValue]) {
                    voiceSelect.value = currentValue;
                }
            }
        } catch (e) {
            console.log('无法加载音色列表:', e);
        }
    }

    // 显示状态
    function showStatus(message, type) {
        statusEl.textContent = message;
        statusEl.className = 'status ' + type;

        if (type === 'success') {
            setTimeout(() => {
                statusEl.className = 'status';
            }, 3000);
        }
    }
});

/**
 * Qwen-TTS 浏览器扩展 - Content Script
 * 在任意网页上监听文本选择，显示悬浮朗读按钮
 */

(function() {
    'use strict';

    // 默认配置
    const DEFAULT_CONFIG = {
        serverUrl: 'http://localhost:8000',
        voice: 'Cherry',
        enabled: true
    };

    // 状态变量
    let config = { ...DEFAULT_CONFIG };
    let floatBtn = null;
    let audioPlayer = null;
    let currentAudio = null;
    let selectedText = '';
    let isLoading = false;

    // 初始化
    async function init() {
        await loadConfig();
        createFloatButton();
        createAudioPlayer();
        bindEvents();
        listenForConfigChanges();
    }

    // 加载配置
    async function loadConfig() {
        try {
            const result = await chrome.storage.sync.get(['serverUrl', 'voice', 'enabled']);
            config = { ...DEFAULT_CONFIG, ...result };
        } catch (e) {
            console.log('Qwen-TTS: 使用默认配置');
        }
    }

    // 监听配置变化
    function listenForConfigChanges() {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync') {
                if (changes.serverUrl) config.serverUrl = changes.serverUrl.newValue;
                if (changes.voice) config.voice = changes.voice.newValue;
                if (changes.enabled !== undefined) config.enabled = changes.enabled.newValue;
            }
        });
    }

    // 创建悬浮按钮
    function createFloatButton() {
        floatBtn = document.createElement('div');
        floatBtn.id = 'qwen-tts-float-btn';
        floatBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
        `;
        floatBtn.title = '朗读选中文本 (Qwen-TTS)';
        document.body.appendChild(floatBtn);
    }

    // 创建音频播放器
    function createAudioPlayer() {
        audioPlayer = document.createElement('div');
        audioPlayer.id = 'qwen-tts-audio-player';
        audioPlayer.innerHTML = `
            <div class="qwen-tts-player-header">
                <span class="qwen-tts-status">准备中...</span>
                <button class="qwen-tts-close-btn" title="关闭">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <audio controls></audio>
        `;
        document.body.appendChild(audioPlayer);

        // 绑定关闭按钮
        const closeBtn = audioPlayer.querySelector('.qwen-tts-close-btn');
        closeBtn.addEventListener('click', hideAudioPlayer);

        // 获取 audio 元素
        currentAudio = audioPlayer.querySelector('audio');
        currentAudio.addEventListener('ended', () => {
            updatePlayerStatus('播放完成');
            // 播放完成后 0.5 秒自动隐藏
            setTimeout(() => hideAudioPlayer(), 500);
        });
        currentAudio.addEventListener('error', () => updatePlayerStatus('播放失败'));
        currentAudio.addEventListener('play', () => updatePlayerStatus('播放中...'));
        currentAudio.addEventListener('pause', () => {
            if (!currentAudio.ended) updatePlayerStatus('已暂停');
        });

        // 添加拖动功能
        initDraggable();
    }

    // 初始化拖动功能
    function initDraggable() {
        const header = audioPlayer.querySelector('.qwen-tts-player-header');
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener('mousedown', (e) => {
            // 如果点击的是关闭按钮，不启动拖动
            if (e.target.closest('.qwen-tts-close-btn')) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = audioPlayer.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            audioPlayer.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            let newLeft = initialLeft + deltaX;
            let newTop = initialTop + deltaY;

            // 限制在视口内
            const maxLeft = window.innerWidth - audioPlayer.offsetWidth - 10;
            const maxTop = window.innerHeight - audioPlayer.offsetHeight - 10;

            newLeft = Math.max(10, Math.min(newLeft, maxLeft));
            newTop = Math.max(10, Math.min(newTop, maxTop));

            audioPlayer.style.left = `${newLeft + window.scrollX}px`;
            audioPlayer.style.top = `${newTop + window.scrollY}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                audioPlayer.classList.remove('dragging');
            }
        });
    }

    // 绑定事件
    function bindEvents() {
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('mousedown', handleMouseDown);
        floatBtn.addEventListener('click', handleFloatBtnClick);
        document.addEventListener('keyup', (e) => {
            if (e.shiftKey) handleSelectionChange();
        });
        document.addEventListener('scroll', () => hideFloatBtn(), true);
    }

    // 处理鼠标抬起
    function handleMouseUp(e) {
        if (!config.enabled) return;
        setTimeout(() => handleSelectionChange(e), 10);
    }

    // 处理鼠标按下
    function handleMouseDown(e) {
        if (!floatBtn.contains(e.target) && !audioPlayer.contains(e.target)) {
            hideFloatBtn();
        }
    }

    // 处理选择变化
    function handleSelectionChange(e) {
        if (!config.enabled) return;

        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text.length > 0 && text.length <= 1000) {
            selectedText = text;
            showFloatBtn(selection);
        } else if (!isLoading) {
            hideFloatBtn();
        }
    }

    // 显示悬浮按钮
    function showFloatBtn(selection) {
        if (isLoading) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        let left = rect.right + window.scrollX + 8;
        let top = rect.top + window.scrollY - 8;

        // 确保在视口内
        const btnSize = 40;
        if (left + btnSize > window.scrollX + window.innerWidth) {
            left = rect.left + window.scrollX - btnSize - 8;
        }
        if (top < window.scrollY + 8) {
            top = rect.bottom + window.scrollY + 8;
        }

        floatBtn.style.left = `${left}px`;
        floatBtn.style.top = `${top}px`;
        floatBtn.classList.add('visible');
    }

    // 隐藏悬浮按钮
    function hideFloatBtn() {
        if (!isLoading) {
            floatBtn.classList.remove('visible');
        }
    }

    // 处理悬浮按钮点击
    async function handleFloatBtnClick(e) {
        e.preventDefault();
        e.stopPropagation();

        if (isLoading || !selectedText) return;

        isLoading = true;
        floatBtn.classList.add('loading');

        try {
            await speakText(selectedText);
        } catch (error) {
            console.error('Qwen-TTS 语音合成失败:', error);
            showError(error.message);
        } finally {
            isLoading = false;
            floatBtn.classList.remove('loading');
            hideFloatBtn();
        }
    }

    // 创建 WAV 文件头
    function createWavHeader(dataLength, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
        const byteRate = sampleRate * channels * bitsPerSample / 8;
        const blockAlign = channels * bitsPerSample / 8;
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);

        // RIFF chunk descriptor
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true); // file size - 8
        writeString(view, 8, 'WAVE');

        // fmt sub-chunk
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // sub-chunk size
        view.setUint16(20, 1, true); // audio format (PCM)
        view.setUint16(22, channels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);

        // data sub-chunk
        writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);

        return new Uint8Array(buffer);
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // Int16 PCM 转 Float32 (Web Audio API 需要)
    function int16ToFloat32(int16Array) {
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }
        return float32Array;
    }

    // 朗读文本 - 流式接收和渐进播放
    async function speakText(text) {
        const apiUrl = `${config.serverUrl}/api/stream`;
        const SAMPLE_RATE = 24000;
        const MIN_BUFFER_BYTES = 24000; // 约0.5秒的数据开始播放 (24000Hz * 2bytes * 0.5s)

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                voice: config.voice
            })
        });

        if (!response.ok) {
            let errorMsg = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.detail || errorMsg;
            } catch (e) {}
            throw new Error(errorMsg);
        }

        showAudioPlayer();
        updatePlayerStatus('连接中...');

        // 创建 AudioContext
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: SAMPLE_RATE
        });

        const reader = response.body.getReader();
        let receivedLength = 0;
        let startTime = performance.now();
        let playbackStarted = false;
        let nextPlayTime = audioContext.currentTime;

        // 缓冲区管理
        let pendingBuffer = new Uint8Array(0);
        const audioBufferQueue = [];
        let isScheduling = false;

        // 播放队列中的音频
        function scheduleNextBuffer() {
            if (isScheduling || audioBufferQueue.length === 0) return;

            isScheduling = true;
            const buffer = audioBufferQueue.shift();

            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);

            // 确保播放时间不在过去
            if (nextPlayTime < audioContext.currentTime) {
                nextPlayTime = audioContext.currentTime;
            }

            source.start(nextPlayTime);
            nextPlayTime += buffer.duration;

            source.onended = () => {
                isScheduling = false;
                if (audioBufferQueue.length > 0) {
                    scheduleNextBuffer();
                }
            };

            if (!playbackStarted) {
                playbackStarted = true;
                updatePlayerStatus('播放中...');
            }
        }

        // 处理收到的PCM数据
        function processPCMData(pcmBytes) {
            // 确保是偶数字节 (16-bit = 2 bytes per sample)
            const usableLength = Math.floor(pcmBytes.length / 2) * 2;
            if (usableLength === 0) return;

            // 转换为Int16Array
            const int16Data = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, usableLength / 2);

            // 转换为Float32
            const float32Data = int16ToFloat32(int16Data);

            // 创建AudioBuffer
            const audioBuffer = audioContext.createBuffer(1, float32Data.length, SAMPLE_RATE);
            audioBuffer.getChannelData(0).set(float32Data);

            // 加入队列
            audioBufferQueue.push(audioBuffer);

            // 开始播放
            scheduleNextBuffer();
        }

        // 流式接收和处理
        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                receivedLength += value.length;

                // 合并到待处理缓冲区
                const newBuffer = new Uint8Array(pendingBuffer.length + value.length);
                newBuffer.set(pendingBuffer);
                newBuffer.set(value, pendingBuffer.length);
                pendingBuffer = newBuffer;

                const kb = (receivedLength / 1024).toFixed(1);
                const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

                // 检查是否应该开始播放
                if (!playbackStarted && pendingBuffer.length >= MIN_BUFFER_BYTES) {
                    updatePlayerStatus(`开始播放 (${kb} KB)`);
                    // 处理累积的数据
                    processPCMData(pendingBuffer);
                    pendingBuffer = new Uint8Array(0);
                } else if (playbackStarted) {
                    // 已经开始播放，处理新数据
                    updatePlayerStatus(`播放中... ${kb} KB (${elapsed}s)`);
                    if (pendingBuffer.length >= 4800) { // 约0.1秒的数据就处理
                        processPCMData(pendingBuffer);
                        pendingBuffer = new Uint8Array(0);
                    }
                } else {
                    updatePlayerStatus(`缓冲中: ${kb} KB (${elapsed}s)`);
                }
            }

            // 处理剩余数据
            if (pendingBuffer.length > 0) {
                processPCMData(pendingBuffer);
            }

            if (receivedLength === 0) {
                throw new Error('未接收到音频数据');
            }

            // 等待播放完成
            const checkComplete = () => {
                if (audioBufferQueue.length === 0 && !isScheduling) {
                    updatePlayerStatus('播放完成');
                    setTimeout(() => {
                        hideAudioPlayer();
                        audioContext.close();
                    }, 500);
                } else {
                    setTimeout(checkComplete, 100);
                }
            };

            // 如果已经开始播放，等待完成
            if (playbackStarted) {
                setTimeout(checkComplete, 100);
            } else if (receivedLength > 0) {
                // 数据太少没触发播放，强制播放
                processPCMData(pendingBuffer);
                setTimeout(checkComplete, 100);
            }

        } catch (e) {
            console.error('流式播放错误:', e);
            audioContext.close();
            throw e;
        }
    }

    // 显示播放器
    function showAudioPlayer() {
        const btnRect = floatBtn.getBoundingClientRect();

        let left = btnRect.left + window.scrollX - 120;
        let top = btnRect.bottom + window.scrollY + 10;

        const playerWidth = 280;
        if (left + playerWidth > window.scrollX + window.innerWidth) {
            left = window.scrollX + window.innerWidth - playerWidth - 20;
        }
        if (left < window.scrollX + 20) {
            left = window.scrollX + 20;
        }
        if (top + 100 > window.scrollY + window.innerHeight) {
            top = btnRect.top + window.scrollY - 100;
        }

        audioPlayer.style.left = `${left}px`;
        audioPlayer.style.top = `${top}px`;
        audioPlayer.classList.add('visible');
    }

    // 隐藏播放器
    function hideAudioPlayer() {
        audioPlayer.classList.remove('visible');
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.src = '';
        }
    }

    // 更新播放器状态
    function updatePlayerStatus(status) {
        const statusEl = audioPlayer.querySelector('.qwen-tts-status');
        if (statusEl) {
            statusEl.textContent = status;
        }
    }

    // 显示错误
    function showError(message) {
        showAudioPlayer();
        updatePlayerStatus(`错误: ${message}`);
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

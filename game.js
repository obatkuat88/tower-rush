// Tower Rush - Core Game Loop
// 60-second endless rush tower defense

const Sound = (() => {
    let audioCtx = null;
    let enabled = true;
    
    function init() {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            console.log('Sound initialized');
        } catch (e) {
            console.warn('Web Audio not supported');
            enabled = false;
        }
    }
    
    function play(freq, duration, type = 'sine', volume = 0.3) {
        if (!enabled || !audioCtx) return;
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }
    
    return {
        init,
        enable: () => enabled = true,
        disable: () => enabled = false,
        
        // Tower placed
        towerPlace: () => play(440, 0.1, 'square', 0.2),
        
        // Tower upgraded
        towerUpgrade: () => {
            play(523, 0.1, 'sine', 0.2);
            setTimeout(() => play(659, 0.15, 'sine', 0.2), 100);
        },
        
        // Enemy hit
        enemyHit: () => play(200, 0.05, 'sawtooth', 0.15),
        
        // Token collected
        tokenCollect: () => play(880, 0.1, 'sine', 0.25),
        
        // Enemy killed
        enemyKill: () => {
            play(600, 0.1, 'square', 0.2);
            setTimeout(() => play(800, 0.1, 'square', 0.15), 50);
        },
        
        // Not enough tokens
        noTokens: () => play(150, 0.2, 'sawtooth', 0.2),
        
        // Button click
        buttonClick: () => play(600, 0.05, 'sine', 0.15),
        
        // Game start
        gameStart: () => {
            play(330, 0.1, 'sine', 0.2);
            setTimeout(() => play(440, 0.1, 'sine', 0.2), 100);
            setTimeout(() => play(550, 0.15, 'sine', 0.2), 200);
        },
        
        // Game over
        gameOver: () => {
            play(440, 0.2, 'sine', 0.25);
            setTimeout(() => play(330, 0.2, 'sine', 0.25), 200);
            setTimeout(() => play(220, 0.4, 'sine', 0.3), 400);
        },
        
        // New high score
        highScore: () => {
            play(523, 0.1, 'sine', 0.2);
            setTimeout(() => play(659, 0.1, 'sine', 0.2), 100);
            setTimeout(() => play(784, 0.1, 'sine', 0.2), 200);
            setTimeout(() => play(1047, 0.2, 'sine', 0.25), 300);
        },
        
        // Level up
        levelUp: () => {
            play(440, 0.1, 'square', 0.15);
            setTimeout(() => play(550, 0.1, 'square', 0.15), 80);
            setTimeout(() => play(660, 0.1, 'square', 0.15), 160);
        }
    };
})();

// Track previous level for level-up sound
let prevLevel = 1;

const Game = (() => {
    // Game State
    let canvas, ctx;
    let gameState = 'home'; // home, playing, gameover, leaderboard
    let gameTime = 60;
    let score = 0;
    let tokens = 0;
    let level = 1;
    let highScore = 0;
    let selectedTowerType = 'damage';
    let selectedTower = null;
    let isChallengeMode = false;
    let challengeSeed = 0;
    let challengeDate = '';
    
    // Social Features
    let friends = [];
    let playerId = '';
    
    // Game Entities
    let towers = [];
    let enemies = [];
    let projectiles = [];
    let floatingTexts = [];
    
    // Timing
    let lastTime = 0;
    let enemySpawnTimer = 0;
    let incomeTimer = 0;
    
    // Tower types configuration - Prehistoric Theme
    const TOWER_TYPES = {
        damage: { cost: 10, damage: 10, range: 150, color: '#c95a3a', name: 'Club' },      // Red-brown
        income: { cost: 15, damage: 0, range: 0, color: '#d4a574', name: 'Gather', income: 2 }, // Golden brown
        support: { cost: 20, damage: 0, range: 100, color: '#8b7355', name: 'Drum', buff: 0.2 }  // Stone brown
    };
    
    // Initialize
    function init() {
        console.log('Game init starting...');
        
        canvas = document.getElementById('game-canvas');
        ctx = canvas.getContext('2d');
        
        console.log('Canvas found:', !!canvas);
        
        // Set canvas size immediately
        resizeCanvas();
        
        // Also handle orientation changes
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('orientationchange', () => {
            setTimeout(resizeCanvas, 100);
        });
        
        // Load high score
        highScore = parseInt(localStorage.getItem('towerRushHighScore')) || 0;
        document.getElementById('home-high-score').textContent = highScore;
        
        // Initialize sound
        Sound.init();
        
        // Initialize social features
        initSocial();
        
        // Initialize daily challenge
        initDailyChallenge();
        
        // Initialize Telegram WebApp
        initTelegram();
        
        // Event listeners
        setupEventListeners();
        console.log('Event listeners setup complete');
        
        // Start game loop
        requestAnimationFrame(gameLoop);
        console.log('Game loop started');
    }
    
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    function setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Play button - support touch
        const playBtn = document.getElementById('play-btn');
        console.log('Play button found:', !!playBtn);
        if (playBtn) {
            playBtn.addEventListener('click', () => { console.log('PLAY clicked'); startGame(); });
            playBtn.addEventListener('touchend', (e) => { e.preventDefault(); console.log('PLAY touched'); startGame(); });
        }
        
        // Replay button
        const replayBtn = document.getElementById('replay-btn');
        replayBtn.addEventListener('click', startGame);
        replayBtn.addEventListener('touchend', (e) => { e.preventDefault(); startGame(); });
        
        // Home button
        const homeBtn = document.getElementById('home-btn');
        homeBtn.addEventListener('click', showHome);
        homeBtn.addEventListener('touchend', (e) => { e.preventDefault(); showHome(); });
        
        // Leaderboard button
        const leaderBtn = document.getElementById('leaderboard-btn');
        leaderBtn.addEventListener('click', showLeaderboard);
        leaderBtn.addEventListener('touchend', (e) => { e.preventDefault(); showLeaderboard(); });
        
        const backBtn = document.getElementById('back-btn');
        backBtn.addEventListener('click', showHome);
        backBtn.addEventListener('touchend', (e) => { e.preventDefault(); showHome(); });
        
        // Friends button
        const friendsBtn = document.getElementById('friends-btn');
        friendsBtn.addEventListener('click', showFriends);
        friendsBtn.addEventListener('touchend', (e) => { e.preventDefault(); showFriends(); });
        
        const friendsBackBtn = document.getElementById('friends-back-btn');
        friendsBackBtn.addEventListener('click', showHome);
        friendsBackBtn.addEventListener('touchend', (e) => { e.preventDefault(); showHome(); });
        
        const addFriendBtn = document.getElementById('add-friend-btn');
        addFriendBtn.addEventListener('click', handleAddFriend);
        addFriendBtn.addEventListener('touchend', (e) => { e.preventDefault(); handleAddFriend(); });
        
        // Challenge button
        const challengeBtn = document.getElementById('challenge-btn');
        challengeBtn.addEventListener('click', startChallenge);
        challengeBtn.addEventListener('touchend', (e) => { e.preventDefault(); startChallenge(); });
        
        const challengeBackBtn = document.getElementById('challenge-back-btn');
        challengeBackBtn.addEventListener('click', showHome);
        challengeBackBtn.addEventListener('touchend', (e) => { e.preventDefault(); showHome(); });
        
        const challengeShareBtn = document.getElementById('challenge-share-btn');
        challengeShareBtn.addEventListener('click', shareChallenge);
        challengeShareBtn.addEventListener('touchend', (e) => { e.preventDefault(); shareChallenge(); });
        
        // Share button
        const shareBtn = document.getElementById('share-btn');
        shareBtn.addEventListener('click', shareToTelegram);
        shareBtn.addEventListener('touchend', (e) => { e.preventDefault(); shareToTelegram(); });
        
        // Tower selection
        document.querySelectorAll('.tower-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedTowerType = btn.dataset.type;
                selectedTower = null;
                updateSelectedTowerInfo();
            });
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedTowerType = btn.dataset.type;
                selectedTower = null;
                updateSelectedTowerInfo();
            });
        });
        
        // Select first tower by default
        document.querySelector('.tower-btn.damage').classList.add('selected');
        
        // Canvas interaction - support both click and touch
        canvas.addEventListener('click', handleCanvasClick);
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            handleCanvasClick({ clientX: touch.clientX, clientY: touch.clientY });
        }, { passive: false });
        
        // Mute button
        const muteBtn = document.getElementById('mute-btn');
        let isMuted = false;
        muteBtn.addEventListener('click', () => {
            isMuted = !isMuted;
            if (isMuted) {
                Sound.disable();
                muteBtn.textContent = '🔇';
            } else {
                Sound.enable();
                muteBtn.textContent = '🔊';
            }
            Sound.buttonClick();
        });
    }
    
    // Social Features System
    function initSocial() {
        // Generate or load player ID
        playerId = localStorage.getItem('towerRushPlayerId');
        if (!playerId) {
            playerId = 'player_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('towerRushPlayerId', playerId);
        }
        
        // Load friends from localStorage
        const storedFriends = localStorage.getItem('towerRushFriends');
        if (storedFriends) {
            friends = JSON.parse(storedFriends);
        } else {
            // Demo friends for testing
            friends = [
                { id: 'friend_1', name: 'Alice', highScore: 850 },
                { id: 'friend_2', name: 'Bob', highScore: 720 },
                { id: 'friend_3', name: 'Charlie', highScore: 680 }
            ];
            saveFriends();
        }
    }
    
    function saveFriends() {
        localStorage.setItem('towerRushFriends', JSON.stringify(friends));
    }
    
    function addFriend(name) {
        const newFriend = {
            id: 'friend_' + Math.random().toString(36).substr(2, 9),
            name: name,
            highScore: 0
        };
        friends.push(newFriend);
        saveFriends();
        return newFriend;
    }
    
    function getFriends() {
        return friends;
    }
    
    function updateFriendScore(friendId, score) {
        const friend = friends.find(f => f.id === friendId);
        if (friend && score > friend.highScore) {
            friend.highScore = score;
            saveFriends();
        }
    }
    
    // Daily Challenge System
    function initDailyChallenge() {
        const today = new Date().toISOString().split('T')[0];
        challengeDate = localStorage.getItem('towerRushChallengeDate') || '';
        
        if (challengeDate !== today) {
            // New day, new challenge
            challengeDate = today;
            localStorage.setItem('towerRushChallengeDate', today);
            challengeSeed = Math.floor(Math.random() * 10000);
            localStorage.setItem('towerRushChallengeSeed', challengeSeed);
        } else {
            challengeSeed = parseInt(localStorage.getItem('towerRushChallengeSeed')) || 0;
        }
        
        // Update challenge UI
        updateChallengeDisplay();
    }
    
    function updateChallengeDisplay() {
        const challengeEl = document.getElementById('challenge-info');
        if (challengeEl) {
            challengeEl.textContent = `Daily Challenge #${challengeSeed}`;
        }
    }
    
    function getChallengeSeed() {
        return challengeSeed;
    }
    
    function isChallengeModeEnabled() {
        return isChallengeMode;
    }
    
    function toggleChallengeMode() {
        isChallengeMode = !isChallengeMode;
        const btn = document.getElementById('challenge-btn');
        if (btn) {
            btn.textContent = isChallengeMode ? '🎯 Challenge Mode: ON' : '🎯 Daily Challenge';
            btn.classList.toggle('active', isChallengeMode);
        }
        return isChallengeMode;
    }
    
    function getTodayChallenge() {
        const today = new Date();
        const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
        return {
            date: challengeDate,
            seed: challengeSeed,
            day: dayOfYear,
            description: getChallengeDescription(dayOfYear % 5)
        };
    }
    
    function getChallengeDescription(index) {
        const descriptions = [
            'Double Tokens! Earn 2x tokens from enemies.',
            'Speed Run! Enemies are faster but worth more.',
            'Tank Mode! Enemies have more HP but drop more.',
            'Income Boost! Income towers generate 3x.',
            'Chaos! Random enemy types and speeds.'
        ];
        return descriptions[index];
    }
    
    // Telegram WebApp Integration
    let telegramUser = null;
    
    function initTelegram() {
        if (window.Telegram && window.Telegram.WebApp) {
            const webApp = window.Telegram.WebApp;
            
            // Expand to full screen
            webApp.ready();
            webApp.expand();
            
            // Get user info
            if (webApp.initDataUnsafe && webApp.initDataUnsafe.user) {
                telegramUser = webApp.initDataUnsafe.user;
                console.log('Telegram user:', telegramUser.first_name);
            }
            
            // Set theme color to match prehistoric
            webApp.setHeaderColor('#1a0f08');
            webApp.setBackgroundColor('#1a0f08');
            
            // Add to global for sharing
            window.TelegramWebApp = webApp;
        }
    }
    
    function shareToTelegram() {
        const text = `🦴 Tower Rush\n📊 Score: ${score}\n📈 Level: ${level}\n💰 Portfolio: ${tokens}\n\nCan you beat my score?`;
        
        if (window.TelegramWebApp) {
            // Use Telegram's native share if available
            window.TelegramWebApp.shareUrl(text);
        } else {
            // Fallback to web share
            const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`;
            window.open(telegramUrl, '_blank');
        }
    }
    
    function shareChallenge() {
        const challenge = getTodayChallenge();
        const text = `🎯 Tower Rush Daily Challenge\n📊 My Score: ${score}\n📈 Level: ${level}\n🎯 Challenge: ${challenge.description}\n\nCan you beat my score?`;
        
        if (window.TelegramWebApp) {
            window.TelegramWebApp.shareUrl(text);
        } else {
            const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`;
            window.open(telegramUrl, '_blank');
        }
    }
    
    function handleCanvasClick(e) {
        if (gameState !== 'playing') return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Check if clicking on existing tower (upgrade)
        const clickedTower = towers.find(t => {
            const dist = Math.hypot(t.x - x, t.y - y);
            return dist < 30;
        });
        
        if (clickedTower && clickedTower.level < 5) {
            upgradeTower(clickedTower);
            return;
        }
        
        // Place new tower
        placeTower(x, y);
    }
    
    function placeTower(x, y) {
        const towerConfig = TOWER_TYPES[selectedTowerType];
        
        if (tokens >= towerConfig.cost) {
            tokens -= towerConfig.cost;
            
            const tower = {
                x,
                y,
                type: selectedTowerType,
                level: 1,
                ...towerConfig,
                lastShot: 0,
                target: null
            };
            
            towers.push(tower);
            
            Sound.towerPlace();
            
            // Floating text for placement
            floatingTexts.push({
                x,
                y,
                text: `-${towerConfig.cost}`,
                color: '#ff6b6b',
                life: 1
            });
            
            updateHUD();
        } else {
            // Not enough tokens
            Sound.noTokens();
            floatingTexts.push({
                x,
                y,
                text: 'Not enough tokens!',
                color: '#ff4444',
                life: 1.5
            });
        }
    }
    
    function upgradeTower(tower) {
        const upgradeCost = Math.floor(tower.cost * tower.level * 0.8);
        
        if (tokens >= upgradeCost && tower.level < 5) {
            tokens -= upgradeCost;
            tower.level++;
            tower.damage = Math.floor(TOWER_TYPES[tower.type].damage * (1 + tower.level * 0.3));
            tower.range = Math.floor(TOWER_TYPES[tower.type].range * (1 + tower.level * 0.2));
            
            floatingTexts.push({
                x: tower.x,
                y: tower.y - 20,
                text: `Level ${tower.level}!`,
                color: '#ffd93d',
                life: 1
            });
            
            Sound.towerUpgrade();
            updateHUD();
        }
    }
    
    function startGame() {
        // Reset game state
        gameState = 'playing';
        gameTime = 60;
        score = 0;
        tokens = 30; // Start with some tokens
        level = 1;
        prevLevel = 1;
        towers = [];
        enemies = [];
        projectiles = [];
        floatingTexts = [];
        
        showScreen('game-screen');
        updateHUD();
        Sound.gameStart();
    }
    
    function showHome() {
        gameState = 'home';
        highScore = parseInt(localStorage.getItem('towerRushHighScore')) || 0;
        document.getElementById('home-high-score').textContent = highScore;
        showScreen('home-screen');
    }
    
    function showLeaderboard() {
        gameState = 'leaderboard';
        showScreen('leaderboard-screen');
        generateLeaderboard();
    }
    
    function showFriends() {
        gameState = 'friends';
        showScreen('friends-screen');
        renderFriendsList();
    }
    
    function renderFriendsList() {
        const list = document.getElementById('friends-list');
        if (friends.length === 0) {
            list.innerHTML = '<div class="no-friends">No friends yet. Add some!</div>';
            return;
        }
        
        list.innerHTML = friends.map((friend, i) => `
            <div class="friend-entry">
                <span class="friend-rank">#${i + 1}</span>
                <span class="friend-name">${friend.name}</span>
                <span class="friend-score">${friend.highScore}</span>
                <button class="friend-action" data-id="${friend.id}">⚔️</button>
            </div>
        `).join('');
        
        // Add event listeners for attack buttons
        document.querySelectorAll('.friend-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const friendId = btn.dataset.id;
                alert(`Friend attack feature coming soon! You'll battle ${friends.find(f => f.id === friendId)?.name}'s tower.`);
            });
        });
    }
    
    function handleAddFriend() {
        const input = document.getElementById('friend-name-input');
        const name = input.value.trim();
        if (name) {
            addFriend(name);
            input.value = '';
            renderFriendsList();
            Sound.buttonClick();
        }
    }
    
    function startChallenge() {
        // Enable challenge mode and start game
        isChallengeMode = true;
        startGame();
        Sound.buttonClick();
    }
    
    function shareChallenge() {
        const challenge = getTodayChallenge();
        const text = `🎯 Tower Rush Daily Challenge\n📊 My Score: ${score}\n📈 Level: ${level}\n🎯 Challenge: ${challenge.description}\n\nCan you beat my score?`;
        
        const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`;
        window.open(telegramUrl, '_blank');
    }
    
    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }
    
    function updateHUD() {
        document.getElementById('timer-num').textContent = Math.ceil(gameTime);
        document.getElementById('level-num').textContent = level;
        document.getElementById('token-num').textContent = tokens;
        document.getElementById('score-num').textContent = score;
    }
    
    function updateSelectedTowerInfo() {
        const info = document.getElementById('selected-tower-info');
        if (selectedTower) {
            info.classList.remove('hidden');
            document.getElementById('upgrade-text').textContent = `Upgrade: ${Math.floor(selectedTower.cost * selectedTower.level * 0.8)} tokens`;
        } else {
            info.classList.add('hidden');
        }
    }
    
    // Game Loop
    function gameLoop(timestamp) {
        const deltaTime = (timestamp - lastTime) / 1000;
        lastTime = timestamp;
        
        if (gameState === 'playing') {
            update(deltaTime);
        }
        
        render();
        requestAnimationFrame(gameLoop);
    }
    
    function update(dt) {
        // Update game time
        gameTime -= dt;
        if (gameTime <= 0) {
            endGame();
            return;
        }
        
        // Update level based on time
        level = Math.floor((60 - gameTime) / 10) + 1;
        
        // Check for level up
        if (level > prevLevel && level <= 6) {
            Sound.levelUp();
            prevLevel = level;
        }
        
        // Spawn enemies
        enemySpawnTimer += dt;
        const spawnInterval = Math.max(0.5, 1.5 - level * 0.1);
        
        if (enemySpawnTimer >= spawnInterval) {
            spawnEnemy();
            enemySpawnTimer = 0;
        }
        
        // Income towers generate tokens
        incomeTimer += dt;
        if (incomeTimer >= 1) {
            let incomeMultiplier = 1;
            
            // Challenge mode: Income Boost (day % 5 === 3)
            if (isChallengeMode) {
                const challenge = getTodayChallenge();
                if (challenge.day % 5 === 3) {
                    incomeMultiplier = 3; // 3x income!
                }
            }
            
            towers.filter(t => t.type === 'income').forEach(tower => {
                const income = tower.income * tower.level * incomeMultiplier;
                tokens += income;
                floatingTexts.push({
                    x: tower.x,
                    y: tower.y - 20,
                    text: `+${income}`,
                    color: '#ffd93d',
                    life: 1
                });
            });
            incomeTimer = 0;
            updateHUD();
        }
        
        // Update enemies
        enemies.forEach(enemy => {
            enemy.x -= enemy.speed * dt * 60;
            
            if (enemy.x < -20) {
                enemy.reachedEnd = true;
            }
        });
        
        // Remove enemies that reached end
        enemies = enemies.filter(e => !e.reachedEnd);
        
        // Towers attack enemies
        const now = Date.now();
        towers.forEach(tower => {
            if (tower.type === 'damage' || tower.type === 'support') {
                // Find target
                const range = tower.range;
                let target = null;
                let minDist = Infinity;
                
                enemies.forEach(enemy => {
                    const dist = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
                    if (dist < range && dist < minDist) {
                        minDist = dist;
                        target = enemy;
                    }
                });
                
                tower.target = target;
                
                // Fire projectile
                if (target && now - tower.lastShot > 500) {
                    projectiles.push({
                        x: tower.x,
                        y: tower.y,
                        targetX: target.x,
                        targetY: target.y,
                        speed: 8,
                        damage: tower.damage,
                        color: tower.color
                    });
                    tower.lastShot = now;
                }
            }
        });
        
        // Update projectiles
        projectiles.forEach(proj => {
            const dx = proj.targetX - proj.x;
            const dy = proj.targetY - proj.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist < 10) {
                proj.hit = true;
            } else {
                proj.x += (dx / dist) * proj.speed;
                proj.y += (dy / dist) * proj.speed;
            }
        });
        
        // Check projectile hits
        projectiles.filter(p => p.hit).forEach(proj => {
            enemies.forEach(enemy => {
                const dist = Math.hypot(enemy.x - proj.x, enemy.y - proj.y);
                if (dist < 20) {
                    enemy.hp -= proj.damage;
                    
                    if (enemy.hp <= 0) {
                        enemy.dead = true;
                        Sound.enemyKill();
                        // Drop tokens
                        const tokenValue = 5 + level * 2;
                        tokens += tokenValue;
                        score += tokenValue;
                        
                        floatingTexts.push({
                            x: enemy.x,
                            y: enemy.y,
                            text: `+${tokenValue}`,
                            color: '#ffd93d',
                            life: 1
                        });
                    }
                }
            });
        });
        
        // Remove dead enemies and used projectiles
        enemies = enemies.filter(e => !e.dead);
        projectiles = projectiles.filter(p => !p.hit);
        
        // Update floating texts
        floatingTexts.forEach(ft => {
            ft.y -= 30 * dt;
            ft.life -= dt;
        });
        floatingTexts = floatingTexts.filter(ft => ft.life > 0);
        
        // Support tower buff
        towers.filter(t => t.type === 'support').forEach(supportTower => {
            towers.forEach(tower => {
                if (tower !== supportTower && tower.type !== 'support') {
                    const dist = Math.hypot(tower.x - supportTower.x, tower.y - supportTower.y);
                    if (dist < supportTower.range) {
                        tower.buffed = supportTower.buff;
                    }
                }
            });
        });
        
        updateHUD();
    }
    
    function spawnEnemy() {
        // Use seeded random for challenge mode
        let y, hp, speed, color;
        
        if (isChallengeMode) {
            // Seeded random based on challenge seed + time
            const seed = challengeSeed + enemies.length + Math.floor(gameTime * 10);
            const random = seededRandom(seed);
            y = 100 + random() * (canvas.height - 250);
            
            const challenge = getTodayChallenge();
            const difficulty = Math.min(level / 10, 1);
            
            // Apply challenge-specific modifiers
            const dayOfYear = challenge.day;
            const modType = dayOfYear % 5;
            
            switch(modType) {
                case 0: // Double Tokens
                    hp = 20 + difficulty * 30;
                    speed = 1 + difficulty * 2;
                    color = difficulty < 0.3 ? '#4ade80' : difficulty < 0.6 ? '#fbbf24' : '#f87171';
                    break;
                case 1: // Speed Run
                    hp = 15 + difficulty * 20;
                    speed = (1 + difficulty * 3) * 1.5;
                    color = '#ff6b6b';
                    break;
                case 2: // Tank Mode
                    hp = (20 + difficulty * 50) * 1.5;
                    speed = 0.8 + difficulty;
                    color = '#9b59b6';
                    break;
                case 3: // Income Boost (same as normal but handled in income timer)
                    hp = 20 + difficulty * 30;
                    speed = 1 + difficulty * 2;
                    color = difficulty < 0.3 ? '#4ade80' : difficulty < 0.6 ? '#fbbf24' : '#f87171';
                    break;
                case 4: // Chaos
                    hp = 15 + Math.random() * 40;
                    speed = 0.5 + Math.random() * 4;
                    const colors = ['#4ade80', '#fbbf24', '#f87171', '#667eea', '#ff6b6b'];
                    color = colors[Math.floor(random() * colors.length)];
                    break;
            }
        } else {
            y = 100 + Math.random() * (canvas.height - 250);
            const difficulty = Math.min(level / 10, 1);
            hp = 20 + difficulty * 30;
            speed = 1 + difficulty * 2;
            color = difficulty < 0.3 ? '#4ade80' : difficulty < 0.6 ? '#fbbf24' : '#f87171';
        }
        
        enemies.push({
            x: canvas.width + 20,
            y,
            hp,
            maxHp: hp,
            speed,
            color,
            dead: false,
            reachedEnd: false
        });
    }
    
    // Seeded random function for challenge mode
    function seededRandom(seed) {
        return function() {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
    }
    
    function endGame() {
        gameState = 'gameover';
        
        if (isChallengeMode) {
            // Challenge mode - show challenge results
            const challenge = getTodayChallenge();
            
            // Calculate reward
            const reward = calculateChallengeReward(score);
            
            // Save challenge score
            const prevBest = parseInt(localStorage.getItem('towerRushChallengeBest_' + challengeDate)) || 0;
            const isNewBest = score > prevBest;
            if (isNewBest) {
                localStorage.setItem('towerRushChallengeBest_' + challengeDate, score);
            }
            
            // Show challenge result screen
            document.getElementById('challenge-description').textContent = challenge.description;
            document.getElementById('challenge-final-score').textContent = score;
            document.getElementById('challenge-reward').textContent = isNewBest 
                ? `🎉 New Challenge Best! +${reward} bonus tokens!`
                : `Bonus: +${reward} tokens`;
            
            showScreen('challenge-result-screen');
            isChallengeMode = false;
            return;
        }
        
        // Normal mode - update high score
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('towerRushHighScore', highScore);
            document.getElementById('new-high-score').classList.remove('hidden');
            Sound.highScore();
        } else {
            document.getElementById('new-high-score').classList.add('hidden');
            Sound.gameOver();
        }
        
        // Display final scores
        document.getElementById('final-level').textContent = level;
        document.getElementById('final-tokens').textContent = tokens;
        document.getElementById('final-score').textContent = score;
        
        showScreen('gameover-screen');
    }
    
    function calculateChallengeReward(score) {
        // Base reward: 10% of score
        let reward = Math.floor(score * 0.1);
        
        // Bonus for high scores
        if (score >= 500) reward += 50;
        if (score >= 1000) reward += 100;
        if (score >= 1500) reward += 200;
        
        return Math.min(reward, 500); // Cap at 500
    }
    
    function render() {
        // Clear canvas with prehistoric background
        ctx.fillStyle = '#1a0f08';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw cave background texture
        ctx.strokeStyle = 'rgba(92, 61, 30, 0.15)';
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 50) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        
        if (gameState === 'playing') {
            // Draw towers
            towers.forEach(tower => {
                drawTower(tower);
            });
            
            // Draw enemies
            enemies.forEach(enemy => {
                drawEnemy(enemy);
            });
            
            // Draw projectiles
            projectiles.forEach(proj => {
                ctx.beginPath();
                ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = proj.color;
                ctx.fill();
                ctx.shadowColor = proj.color;
                ctx.shadowBlur = 10;
                ctx.fill();
                ctx.shadowBlur = 0;
            });
            
            // Draw floating texts
            floatingTexts.forEach(ft => {
                ctx.font = 'bold 16px sans-serif';
                ctx.fillStyle = ft.color;
                ctx.globalAlpha = ft.life;
                ctx.textAlign = 'center';
                ctx.fillText(ft.text, ft.x, ft.y);
                ctx.globalAlpha = 1;
            });
        }
    }
    
    function drawTower(tower) {
        const baseSize = 25;
        const size = baseSize + tower.level * 3;
        
        // Tower base
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, size, 0, Math.PI * 2);
        ctx.fillStyle = tower.color;
        ctx.globalAlpha = 0.3;
        ctx.fill();
        ctx.globalAlpha = 1;
        
        // Tower core
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, size * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = tower.color;
        ctx.fill();
        
        // Level indicator
        if (tower.level > 1) {
            ctx.font = 'bold 12px sans-serif';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText(tower.level, tower.x, tower.y + 4);
        }
        
        // Tower type icon
        const icons = { damage: '⚔️', income: '💎', support: '✨' };
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(icons[tower.type], tower.x, tower.y - size - 5);
        
        // Range indicator when selected (simplified - just show for damage towers)
        if (tower.type === 'damage' && tower.target) {
            ctx.beginPath();
            ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
            ctx.strokeStyle = tower.color;
            ctx.globalAlpha = 0.2;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }
    
    function drawEnemy(enemy) {
        const size = 15;
        
        // Enemy body
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, size, 0, Math.PI * 2);
        ctx.fillStyle = enemy.color;
        ctx.fill();
        
        // HP bar
        const hpPercent = enemy.hp / enemy.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(enemy.x - 15, enemy.y - 25, 30, 4);
        ctx.fillStyle = enemy.color;
        ctx.fillRect(enemy.x - 15, enemy.y - 25, 30 * hpPercent, 4);
    }
    
    function generateLeaderboard() {
        const list = document.getElementById('leaderboard-list');
        
        // Generate sample data (in real app, this would come from a server)
        const entries = [
            { name: 'Player1', score: 1250 },
            { name: 'Player2', score: 980 },
            { name: 'Player3', score: 850 },
            { name: 'You', score: score || 0 },
        ].sort((a, b) => b.score - a.score);
        
        list.innerHTML = entries.map((entry, i) => `
            <div class="leaderboard-entry">
                <span class="rank">#${i + 1}</span>
                <span class="name">${entry.name}</span>
                <span class="score">${entry.score}</span>
            </div>
        `).join('');
    }
    
    // Public API
    return { 
        init,
        startGame,
        startChallenge,
        showFriends,
        showLeaderboard,
        showHome,
        shareToTelegram,
        shareChallenge
    };
})();

// Expose functions globally for onclick handlers
window.startGame = Game.startGame;
window.startChallenge = Game.startChallenge;
window.showFriends = Game.showFriends;
window.showLeaderboard = Game.showLeaderboard;
window.showHome = Game.showHome;
window.shareToTelegram = Game.shareToTelegram;
window.shareChallenge = Game.shareChallenge;
window.Game = Game;

// Start game when DOM is ready
document.addEventListener('DOMContentLoaded', Game.init);
/**
 * KBCanvas - Knowledge Base 3D Canvas Module
 *
 * Provides an immersive 3D canvas with mind-map style node connections,
 * drag-and-drop positioning, and animated SVG connections.
 *
 * Enhanced with physics-based interactions inspired by Robot Components:
 * - Dynamic shadow depth during drag
 * - Grid snapping (hold Shift)
 * - Velocity tracking for fast-move effects
 * - Alignment guides
 */

class KBCanvas {
    constructor(containerId) {
        this.space = document.getElementById('kb-3d-space');
        this.svg = document.getElementById('kb-connections-svg');
        this.emptyState = document.getElementById('chain-empty-state');
        this.wrapper = document.querySelector('.kb-canvas-wrapper');
        this.nodes = new Map(); // agentId -> { element, position }
        this.groupHeaders = new Map(); // groupId -> header element
        this.groupContainers = new Map(); // groupId -> { element, connectorNode, bounds }
        this.isDragging = false;
        this.dragTarget = null;
        this.dragOffset = { x: 0, y: 0 };
        this.isDraggingGroup = false;
        this.dragGroupContainer = null;
        this.dragGroupId = null;
        this.dragGroupAgentOffsets = [];
        this.onPositionChange = null;
        this.onToggle = null;
        this.onRemove = null;
        this.onRename = null;
        this.onUngroupAgent = null; // Callback for when agent is ungrouped
        this.layoutTimer = null;
        this.groups = []; // Group data from state

        // Phase 2 & 3: Physics and grid snapping
        this.gridSize = 24; // Match CSS dot grid size
        this.gridSnapEnabled = false;
        this.velocity = { x: 0, y: 0 };
        this.lastDragPos = { x: 0, y: 0 };
        this.lastDragTime = 0;
        this.velocityThreshold = 300; // px/s for fast-move effect
        this.alignmentGuides = { horizontal: null, vertical: null };
        this.snapIndicator = null;
        this.shortcutsTooltip = null;

        if (this.space && this.svg) {
            this.init();
        }
    }

    init() {
        // Mouse event handlers for drag
        this.space.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));

        // Touch support
        this.space.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.onTouchEnd.bind(this));

        // Control buttons
        document.getElementById('kb-auto-layout')?.addEventListener('click', () => this.autoLayout());

        // Resize observer to update connections
        this.resizeObserver = new ResizeObserver(() => this.updateConnections());
        this.resizeObserver.observe(this.space);

        // Phase 2 & 3: Keyboard shortcuts for grid snap
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));

        // Create alignment guides
        this.createAlignmentGuides();

        // Create snap indicator
        this.createSnapIndicator();

        // Create shortcuts tooltip
        this.createShortcutsTooltip();
    }

    /**
     * Create alignment guide elements
     */
    createAlignmentGuides() {
        if (!this.wrapper) return;

        // Horizontal guide
        const hGuide = document.createElement('div');
        hGuide.className = 'kb-alignment-guide horizontal';
        this.wrapper.appendChild(hGuide);
        this.alignmentGuides.horizontal = hGuide;

        // Vertical guide
        const vGuide = document.createElement('div');
        vGuide.className = 'kb-alignment-guide vertical';
        this.wrapper.appendChild(vGuide);
        this.alignmentGuides.vertical = vGuide;
    }

    /**
     * Create grid snap indicator
     */
    createSnapIndicator() {
        if (!this.wrapper) return;

        const indicator = document.createElement('div');
        indicator.className = 'kb-snap-indicator';
        indicator.innerHTML = `
            <span class="snap-icon">⊞</span>
            <span>Grid Snap</span>
            <kbd>Shift</kbd>
        `;
        this.wrapper.appendChild(indicator);
        this.snapIndicator = indicator;
    }

    /**
     * Create keyboard shortcuts tooltip
     */
    createShortcutsTooltip() {
        if (!this.wrapper) return;

        const tooltip = document.createElement('div');
        tooltip.className = 'kb-shortcuts-tooltip';
        tooltip.innerHTML = `
            <div class="shortcut-row"><span>Grid snap</span> <kbd>Shift</kbd></div>
            <div class="shortcut-row"><span>Auto layout</span> <kbd>L</kbd></div>
        `;
        this.wrapper.appendChild(tooltip);
        this.shortcutsTooltip = tooltip;
    }

    /**
     * Handle keyboard shortcuts
     */
    onKeyDown(e) {
        // Shift key for grid snap
        if (e.key === 'Shift' && this.isDragging) {
            this.gridSnapEnabled = true;
            this.updateSnapIndicator(true);
            if (this.dragTarget) {
                this.dragTarget.classList.add('snap-preview');
            }
        }

        // L key for auto-layout (when not in input)
        if (e.key === 'l' || e.key === 'L') {
            const activeEl = document.activeElement;
            if (activeEl?.tagName !== 'INPUT' && activeEl?.tagName !== 'TEXTAREA') {
                this.autoLayout();
            }
        }
    }

    onKeyUp(e) {
        if (e.key === 'Shift') {
            this.gridSnapEnabled = false;
            this.updateSnapIndicator(false);
            if (this.dragTarget) {
                this.dragTarget.classList.remove('snap-preview');
            }
        }
    }

    /**
     * Update snap indicator visibility
     */
    updateSnapIndicator(active) {
        if (!this.snapIndicator) return;

        if (this.isDragging) {
            this.snapIndicator.classList.add('visible');
            this.snapIndicator.classList.toggle('active', active);
        } else {
            this.snapIndicator.classList.remove('visible', 'active');
        }
    }

    /**
     * Show alignment guides when nodes align
     */
    showAlignmentGuide(type, position) {
        const guide = this.alignmentGuides[type];
        if (!guide) return;

        if (type === 'horizontal') {
            guide.style.top = `${position}px`;
        } else {
            guide.style.left = `${position}px`;
        }
        guide.classList.add('visible');
    }

    hideAlignmentGuide(type) {
        const guide = this.alignmentGuides[type];
        if (guide) {
            guide.classList.remove('visible');
        }
    }

    hideAllAlignmentGuides() {
        this.hideAlignmentGuide('horizontal');
        this.hideAlignmentGuide('vertical');
    }

    /**
     * Check for node alignment and show guides
     */
    checkAlignment(x, y, nodeWidth, nodeHeight) {
        const threshold = 8; // Snap threshold in pixels
        const centerX = x + nodeWidth / 2;
        const centerY = y + nodeHeight / 2;
        let alignedH = false;
        let alignedV = false;

        this.nodes.forEach((nodeData, agentId) => {
            if (nodeData.element === this.dragTarget) return;

            const otherX = nodeData.position.x;
            const otherY = nodeData.position.y;
            const otherCenterX = otherX + nodeWidth / 2;
            const otherCenterY = otherY + nodeHeight / 2;

            // Check horizontal alignment (centers)
            if (Math.abs(centerY - otherCenterY) < threshold) {
                this.showAlignmentGuide('horizontal', otherCenterY);
                alignedH = true;
            }

            // Check vertical alignment (centers)
            if (Math.abs(centerX - otherCenterX) < threshold) {
                this.showAlignmentGuide('vertical', otherCenterX);
                alignedV = true;
            }
        });

        if (!alignedH) this.hideAlignmentGuide('horizontal');
        if (!alignedV) this.hideAlignmentGuide('vertical');
    }

    /**
     * Snap position to grid
     */
    snapToGrid(x, y) {
        if (!this.gridSnapEnabled) return { x, y };

        return {
            x: Math.round(x / this.gridSize) * this.gridSize,
            y: Math.round(y / this.gridSize) * this.gridSize
        };
    }

    /**
     * Calculate velocity from drag movement
     */
    updateVelocity(x, y) {
        const now = performance.now();
        const dt = (now - this.lastDragTime) / 1000; // seconds

        if (dt > 0 && dt < 0.1) { // Only calculate if reasonable time delta
            this.velocity.x = (x - this.lastDragPos.x) / dt;
            this.velocity.y = (y - this.lastDragPos.y) / dt;

            // Check for fast movement
            const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
            if (this.dragTarget) {
                if (speed > this.velocityThreshold) {
                    this.dragTarget.classList.add('fast-move');
                } else {
                    this.dragTarget.classList.remove('fast-move');
                }
            }
        }

        this.lastDragPos = { x, y };
        this.lastDragTime = now;
    }

    /**
     * Add a new node to the canvas
     */
    addNode(agent, position = null) {
        if (this.nodes.has(agent.id)) {
            this.updateNode(agent);
            return;
        }

        // Calculate initial position if not provided
        const pos = position || agent.position || this.calculateInitialPosition(agent.index || this.nodes.size);

        // Get group info if agent is grouped
        const group = agent.groupId ? this.getGroupInfo(agent.groupId) : null;
        const groupClass = group ? 'grouped' : '';
        const groupBorderStyle = group ? `border-color: ${group.color}` : '';

        // Create node element
        const nodeEl = document.createElement('div');
        nodeEl.className = `agent-node-3d ${agent.enabled ? '' : 'disabled'} ${groupClass}`;
        nodeEl.dataset.id = agent.id;
        nodeEl.dataset.index = agent.index;
        if (agent.groupId) {
            nodeEl.dataset.groupId = agent.groupId;
        }
        nodeEl.style.left = `${pos.x}px`;
        nodeEl.style.top = `${pos.y}px`;

        const groupBadge = group
            ? `<span class="node-group-badge" style="background: ${group.color}" title="${this.escapeHtml(group.name)}">${group.icon}</span>`
            : '';

        nodeEl.innerHTML = `
            <div class="node-card" style="${groupBorderStyle}">
                ${groupBadge}
                <input type="text"
                       class="node-name"
                       value="${this.escapeHtml(agent.displayName)}"
                       title="Click to edit name" />
                <div class="node-controls">
                    <button class="node-control-btn toggle-btn ${agent.enabled ? 'active' : ''}"
                            title="${agent.enabled ? 'Disable' : 'Enable'}">
                        ${agent.enabled ? '●' : '○'}
                    </button>
                    <button class="node-control-btn remove-btn" title="Remove">✕</button>
                </div>
            </div>
        `;

        // Add event listeners
        this.setupNodeEvents(nodeEl, agent);

        // Add to DOM and map
        this.space.appendChild(nodeEl);
        this.nodes.set(agent.id, { element: nodeEl, position: pos, groupId: agent.groupId });

        // Update empty state and wrapper class
        if (this.emptyState) {
            this.emptyState.style.display = 'none';
        }
        if (this.wrapper) {
            this.wrapper.classList.add('has-nodes');
        }

        // Schedule auto-layout (debounced to handle batch adds)
        this.scheduleAutoLayout();
    }

    /**
     * Set groups data from state
     * Note: Call refreshGroupContainers() after nodes are added to update container bounds
     */
    setGroups(groups) {
        this.groups = groups || [];
        // Just store groups - don't sync containers yet (nodes may not be added)
        // syncGroupContainers will be called by autoLayout or explicitly
    }

    /**
     * Refresh group containers - call after nodes are positioned
     */
    refreshGroupContainers() {
        this.syncGroupContainers();
    }

    /**
     * Update bounds for all group containers (call after node positions change)
     */
    updateAllGroupBounds() {
        this.groups.forEach(group => {
            this.updateGroupContainerBounds(group.id);
        });
    }

    /**
     * Quick method to add a new group
     */
    addGroup(group) {
        if (!this.groups.find(g => g.id === group.id)) {
            this.groups.push(group);
        }
        this.createGroupContainer(group);
        this.updateGroupContainerBounds(group.id);
    }

    /**
     * Quick method to remove a group
     */
    removeGroup(groupId) {
        this.groups = this.groups.filter(g => g.id !== groupId);
        this.removeGroupContainer(groupId);
    }

    /**
     * Get group info by ID
     */
    getGroupInfo(groupId) {
        return this.groups.find(g => g.id === groupId) || null;
    }

    /**
     * Create or update a group container element
     */
    createGroupContainer(group) {
        // Check if container already exists
        let containerData = this.groupContainers.get(group.id);

        if (!containerData) {
            // Create container element
            const container = document.createElement('div');
            container.className = 'kb-group-container';
            container.dataset.groupId = group.id;
            container.style.borderColor = group.color;
            container.style.setProperty('--group-color', group.color);

            // Create header
            const header = document.createElement('div');
            header.className = 'kb-group-container-header';
            header.innerHTML = `
                <span class="group-icon">${group.icon}</span>
                <span class="group-name">${this.escapeHtml(group.name)}</span>
                <span class="group-count">0 agents</span>
            `;
            container.appendChild(header);

            // Insert container at the beginning of space (so nodes render on top)
            // Containers have z-index: 0, nodes have higher z-index
            if (this.space.firstChild) {
                this.space.insertBefore(container, this.space.firstChild);
            } else {
                this.space.appendChild(container);
            }

            containerData = {
                element: container,
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                header: header
            };
            this.groupContainers.set(group.id, containerData);
        } else {
            // Update existing container
            const header = containerData.header;
            if (header) {
                header.querySelector('.group-icon').textContent = group.icon;
                header.querySelector('.group-name').textContent = this.escapeHtml(group.name);
            }
            containerData.element.style.borderColor = group.color;
            containerData.element.style.setProperty('--group-color', group.color);
        }

        return containerData;
    }

    /**
     * Update group container bounds based on contained agents
     */
    updateGroupContainerBounds(groupId) {
        const containerData = this.groupContainers.get(groupId);
        if (!containerData) return;

        // Find all agents in this group
        const groupAgents = [];
        this.nodes.forEach((nodeData, agentId) => {
            if (nodeData.groupId === groupId) {
                groupAgents.push(nodeData);
            }
        });

        // Update agent count
        const countEl = containerData.header?.querySelector('.group-count');
        if (countEl) {
            countEl.textContent = `${groupAgents.length} agent${groupAgents.length !== 1 ? 's' : ''}`;
        }

        if (groupAgents.length === 0) {
            // Hide empty containers
            containerData.element.style.display = 'none';
            return;
        }

        containerData.element.style.display = 'block';

        // Calculate bounding box using actual DOM positions
        const padding = 20;
        const headerHeight = 36;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        groupAgents.forEach(nodeData => {
            // Use actual DOM position for accuracy
            const el = nodeData.element;
            const x = parseFloat(el.style.left) || nodeData.position.x;
            const y = parseFloat(el.style.top) || nodeData.position.y;
            const nodeWidth = el.offsetWidth || 80;   // Compact circular node
            const nodeHeight = el.offsetHeight || 80; // Circular - same as width

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + nodeWidth);
            maxY = Math.max(maxY, y + nodeHeight);
        });

        // Add padding and header space
        const bounds = {
            x: minX - padding,
            y: minY - padding - headerHeight,
            width: Math.max(140, maxX - minX + padding * 2),
            height: Math.max(130, maxY - minY + padding * 2 + headerHeight)
        };

        containerData.bounds = bounds;

        // Position and size container with smooth transition
        const containerEl = containerData.element;
        containerEl.style.left = `${bounds.x}px`;
        containerEl.style.top = `${bounds.y}px`;
        containerEl.style.width = `${bounds.width}px`;
        containerEl.style.height = `${bounds.height}px`;
    }

    /**
     * Remove a group container
     */
    removeGroupContainer(groupId) {
        const containerData = this.groupContainers.get(groupId);
        if (containerData) {
            containerData.element.remove();
            this.groupContainers.delete(groupId);
        }
    }

    /**
     * Sync group containers with current groups
     */
    syncGroupContainers() {
        // Create containers for all groups
        this.groups.forEach(group => {
            this.createGroupContainer(group);
        });

        // Remove containers for deleted groups
        const currentGroupIds = new Set(this.groups.map(g => g.id));
        this.groupContainers.forEach((_, groupId) => {
            if (!currentGroupIds.has(groupId)) {
                this.removeGroupContainer(groupId);
            }
        });

        // Update all container bounds
        this.groups.forEach(group => {
            this.updateGroupContainerBounds(group.id);
        });
    }

    /**
     * Schedule auto-layout with debounce for batch operations
     */
    scheduleAutoLayout() {
        // Clear any pending layout
        if (this.layoutTimer) {
            clearTimeout(this.layoutTimer);
        }

        // Debounce: wait for batch adds to complete
        this.layoutTimer = setTimeout(() => {
            this.layoutTimer = null;
            this.autoLayout();
        }, 150); // Wait 150ms for batch operations to complete
    }

    setupNodeEvents(nodeEl, agent) {
        const card = nodeEl.querySelector('.node-card');
        const toggleBtn = nodeEl.querySelector('.toggle-btn');
        const removeBtn = nodeEl.querySelector('.remove-btn');
        const nameInput = nodeEl.querySelector('.node-name');

        // Toggle button
        toggleBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onToggle) {
                this.onToggle(agent.id, parseInt(nodeEl.dataset.index));
            }
        });

        // Remove button
        removeBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onRemove) {
                this.onRemove(agent.id, parseInt(nodeEl.dataset.index));
            }
        });

        // Name input
        nameInput?.addEventListener('change', (e) => {
            if (this.onRename) {
                this.onRename(agent.id, parseInt(nodeEl.dataset.index), e.target.value);
            }
        });
        nameInput?.addEventListener('blur', (e) => {
            if (this.onRename) {
                this.onRename(agent.id, parseInt(nodeEl.dataset.index), e.target.value);
            }
        });
        nameInput?.addEventListener('mousedown', (e) => e.stopPropagation());
        nameInput?.addEventListener('touchstart', (e) => e.stopPropagation());
    }

    /**
     * Update an existing node's state
     */
    updateNode(agent) {
        const nodeData = this.nodes.get(agent.id);
        if (!nodeData) return;

        const nodeEl = nodeData.element;

        // Update group info
        const group = agent.groupId ? this.getGroupInfo(agent.groupId) : null;
        const groupClass = group ? 'grouped' : '';
        nodeEl.className = `agent-node-3d ${agent.enabled ? '' : 'disabled'} ${groupClass}`;
        nodeEl.dataset.index = agent.index;

        // Update group dataset
        if (agent.groupId) {
            nodeEl.dataset.groupId = agent.groupId;
        } else {
            delete nodeEl.dataset.groupId;
        }
        nodeData.groupId = agent.groupId;

        // Update group badge
        const nodeCard = nodeEl.querySelector('.node-card');
        let groupBadge = nodeEl.querySelector('.node-group-badge');

        if (group) {
            // Update or add badge
            if (!groupBadge) {
                groupBadge = document.createElement('span');
                groupBadge.className = 'node-group-badge';
                nodeCard.insertBefore(groupBadge, nodeCard.firstChild);
            }
            groupBadge.style.background = group.color;
            groupBadge.title = this.escapeHtml(group.name);
            groupBadge.textContent = group.icon;

            // Update border color
            nodeCard.style.borderColor = group.color;
        } else {
            // Remove badge if exists
            if (groupBadge) {
                groupBadge.remove();
            }
            nodeCard.style.borderColor = '';
        }

        const statusRing = nodeEl.querySelector('.node-status-ring');
        const toggleBtn = nodeEl.querySelector('.toggle-btn');
        const nameInput = nodeEl.querySelector('.node-name');

        if (statusRing) {
            statusRing.classList.toggle('active', agent.enabled);
        }

        if (toggleBtn) {
            toggleBtn.classList.toggle('active', agent.enabled);
            toggleBtn.innerHTML = agent.enabled ? '●' : '○';
            toggleBtn.title = agent.enabled ? 'Disable agent' : 'Enable agent';
        }

        if (nameInput && nameInput.value !== agent.displayName) {
            nameInput.value = agent.displayName;
        }

        this.updateConnections();
    }

    /**
     * Remove a node from the canvas
     */
    removeNode(agentId) {
        const nodeData = this.nodes.get(agentId);
        if (!nodeData) return;

        // Animate out
        nodeData.element.style.transition = 'all 0.3s ease-out';
        nodeData.element.style.opacity = '0';
        nodeData.element.style.transform = 'scale(0.8)';

        setTimeout(() => {
            nodeData.element.remove();
            this.nodes.delete(agentId);
            this.autoResizeCanvas();
            this.updateConnections();

            // Show empty state if no nodes
            if (this.nodes.size === 0) {
                if (this.emptyState) {
                    this.emptyState.style.display = 'flex';
                }
                if (this.wrapper) {
                    this.wrapper.classList.remove('has-nodes');
                }
            }
        }, 300);
    }

    /**
     * Calculate initial position for a new node using snake layout
     * Odd rows go left-to-right, even rows go right-to-left
     */
    calculateInitialPosition(index, totalNodes = null) {
        const containerRect = this.space.getBoundingClientRect();
        const nodeWidth = 80;   // Compact circular node
        const nodeHeight = 80;  // Circular - same as width
        const padding = 30;
        const gapX = 30;        // Space for horizontal connectors
        const gapY = 30;        // Space for vertical connectors

        // Calculate how many nodes fit per row
        const availableWidth = containerRect.width - (padding * 2);
        const nodesPerRow = Math.max(1, Math.floor(availableWidth / (nodeWidth + gapX)));

        const row = Math.floor(index / nodesPerRow);
        let col = index % nodesPerRow;

        // Snake pattern: reverse column order on odd rows
        const isOddRow = row % 2 === 1;
        if (isOddRow) {
            col = nodesPerRow - 1 - col;
        }

        // Calculate row width for centering
        const total = totalNodes || this.nodes.size + 1;
        const nodesInThisRow = Math.min(nodesPerRow, total - row * nodesPerRow);
        const totalRowWidth = nodesInThisRow * (nodeWidth + gapX) - gapX;
        const rowOffset = (availableWidth - totalRowWidth) / 2;

        // For odd rows, we need to adjust the offset since we're filling from right
        let x;
        if (isOddRow) {
            // Position from the right side of the row
            const rightEdge = padding + rowOffset + totalRowWidth;
            x = rightEdge - (nodeWidth + gapX) * (nodesPerRow - 1 - col) - nodeWidth;
            // Simpler: just use same logic but col is already reversed
            x = padding + rowOffset + col * (nodeWidth + gapX);
        } else {
            x = padding + rowOffset + col * (nodeWidth + gapX);
        }

        return {
            x: x,
            y: padding + row * (nodeHeight + gapY)
        };
    }

    /**
     * Auto-resize the canvas to fit all nodes
     */
    autoResizeCanvas() {
        if (this.nodes.size === 0) {
            this.space.style.minHeight = '280px';
            return;
        }

        const nodeHeight = 80;  // Compact circular node
        const padding = 30;
        let maxY = 0;

        // Find the lowest node position
        this.nodes.forEach(nodeData => {
            const bottom = nodeData.position.y + nodeHeight;
            if (bottom > maxY) {
                maxY = bottom;
            }
        });

        // Set min-height to accommodate all nodes plus padding
        const requiredHeight = maxY + padding + 40; // Extra padding for controls
        const minHeight = Math.max(280, requiredHeight);
        this.space.style.minHeight = `${minHeight}px`;
    }

    /**
     * Update SVG connections between nodes
     */
    updateConnections() {
        if (!this.svg) return;

        // Clear existing paths (keep defs)
        const paths = this.svg.querySelectorAll('path, circle.particle');
        paths.forEach(p => p.remove());

        // Check if we have grouped layout
        const hasGroups = this.groups.length > 0 &&
            Array.from(this.nodes.values()).some(n => n.groupId);

        if (hasGroups) {
            this.updateConnectionsWithGroups();
        } else {
            this.updateConnectionsFlat();
        }
    }

    /**
     * Flat connections (no groups) - original snake pattern
     */
    updateConnectionsFlat() {
        // Get ordered nodes
        const orderedNodes = Array.from(this.nodes.entries())
            .sort((a, b) => {
                const indexA = parseInt(a[1].element.dataset.index) || 0;
                const indexB = parseInt(b[1].element.dataset.index) || 0;
                return indexA - indexB;
            });

        if (orderedNodes.length < 2) return;

        // Calculate nodes per row for snake detection
        const containerRect = this.space.getBoundingClientRect();
        const nodeWidth = 80;   // Compact circular node
        const padding = 30;
        const gapX = 30;
        const availableWidth = containerRect.width - (padding * 2);
        const nodesPerRow = Math.max(1, Math.floor(availableWidth / (nodeWidth + gapX)));

        // Draw connections between sequential nodes
        for (let i = 0; i < orderedNodes.length - 1; i++) {
            const fromNode = orderedNodes[i][1];
            const toNode = orderedNodes[i + 1][1];

            // Determine if this is a row-end connection (vertical)
            const fromRow = Math.floor(i / nodesPerRow);
            const toRow = Math.floor((i + 1) / nodesPerRow);
            const isRowChange = fromRow !== toRow;

            this.drawConnection(fromNode, toNode, isRowChange);
        }
    }

    /**
     * Connections with groups - intra-group (gold) and inter-group (cyan)
     */
    updateConnectionsWithGroups() {
        // Organize agents by group
        const groupedAgents = new Map(); // groupId -> [{id, nodeData}]
        const ungroupedAgents = [];

        this.nodes.forEach((nodeData, agentId) => {
            if (nodeData.groupId) {
                if (!groupedAgents.has(nodeData.groupId)) {
                    groupedAgents.set(nodeData.groupId, []);
                }
                groupedAgents.get(nodeData.groupId).push({ id: agentId, nodeData });
            } else {
                ungroupedAgents.push({ id: agentId, nodeData });
            }
        });

        // Sort groups by creation date
        const sortedGroups = this.groups
            .filter(g => groupedAgents.has(g.id))
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        // Draw intra-group connections (gold)
        sortedGroups.forEach(group => {
            const agents = groupedAgents.get(group.id) || [];

            // Sort by index within group
            agents.sort((a, b) => {
                const indexA = parseInt(a.nodeData.element?.dataset?.index) || 0;
                const indexB = parseInt(b.nodeData.element?.dataset?.index) || 0;
                return indexA - indexB;
            });

            // Draw connections between agents in this group
            for (let i = 0; i < agents.length - 1; i++) {
                this.drawConnection(agents[i].nodeData, agents[i + 1].nodeData, false, 'intra-group');
            }
        });

        // Draw inter-group connections (cyan) between connector nodes
        if (sortedGroups.length > 1) {
            for (let i = 0; i < sortedGroups.length - 1; i++) {
                const fromGroup = sortedGroups[i];
                const toGroup = sortedGroups[i + 1];

                const fromContainer = this.groupContainers.get(fromGroup.id);
                const toContainer = this.groupContainers.get(toGroup.id);

                if (fromContainer && toContainer) {
                    this.drawInterGroupConnection(fromContainer, toContainer);
                }
            }
        }

        // Draw connections for ungrouped agents
        if (ungroupedAgents.length > 1) {
            ungroupedAgents.sort((a, b) => {
                const indexA = parseInt(a.nodeData.element?.dataset?.index) || 0;
                const indexB = parseInt(b.nodeData.element?.dataset?.index) || 0;
                return indexA - indexB;
            });

            for (let i = 0; i < ungroupedAgents.length - 1; i++) {
                this.drawConnection(ungroupedAgents[i].nodeData, ungroupedAgents[i + 1].nodeData, false);
            }
        }

        // Connect last group to first ungrouped agent if both exist
        if (sortedGroups.length > 0 && ungroupedAgents.length > 0) {
            const lastGroup = sortedGroups[sortedGroups.length - 1];
            const lastGroupAgents = groupedAgents.get(lastGroup.id) || [];
            if (lastGroupAgents.length > 0) {
                const lastGroupContainer = this.groupContainers.get(lastGroup.id);
                const firstUngrouped = ungroupedAgents[0];

                // Draw connection from group connector to first ungrouped
                if (lastGroupContainer) {
                    this.drawGroupToNodeConnection(lastGroupContainer, firstUngrouped.nodeData);
                }
            }
        }
    }

    /**
     * Draw connection between two group containers
     */
    drawInterGroupConnection(fromContainer, toContainer) {
        const fromEl = fromContainer.element;
        const toEl = toContainer.element;

        if (!fromEl || !toEl) return;

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const svgRect = this.svg.getBoundingClientRect();

        // Connect from right edge of from-container to left edge of to-container
        const fromX = fromRect.right - svgRect.left;
        const fromY = fromRect.top + fromRect.height / 2 - svgRect.top;
        const toX = toRect.left - svgRect.left;
        const toY = toRect.top + toRect.height / 2 - svgRect.top;

        // Control points for smooth curve
        const dx = Math.abs(toX - fromX);
        const controlOffset = Math.min(dx * 0.4, 80);

        const cp1x = fromX + controlOffset;
        const cp1y = fromY;
        const cp2x = toX - controlOffset;
        const cp2y = toY;

        // Create path with cyan color for inter-group connections
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${fromX} ${fromY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toX} ${toY}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'url(#intergroup-gradient)');
        path.setAttribute('stroke-width', '3');
        path.setAttribute('filter', 'url(#intergroup-glow)');
        path.classList.add('connection-path', 'inter-group-connection');

        this.svg.appendChild(path);

        // Add animated particle
        this.addParticle(path, fromX, fromY, toX, toY, cp1x, cp1y, cp2x, cp2y, '#22d3ee');
    }

    /**
     * Draw connection from group container to ungrouped node
     */
    drawGroupToNodeConnection(groupContainer, nodeData) {
        const containerEl = groupContainer.element;
        const nodeEl = nodeData.element;

        if (!containerEl || !nodeEl) return;

        const fromRect = containerEl.getBoundingClientRect();
        const toRect = nodeEl.getBoundingClientRect();
        const svgRect = this.svg.getBoundingClientRect();

        const fromX = fromRect.right - svgRect.left;
        const fromY = fromRect.top + fromRect.height / 2 - svgRect.top;
        const toX = toRect.left - svgRect.left;
        const toY = toRect.top + toRect.height / 2 - svgRect.top;

        const dx = Math.abs(toX - fromX);
        const controlOffset = Math.min(dx * 0.4, 60);

        const cp1x = fromX + controlOffset;
        const cp1y = fromY;
        const cp2x = toX - controlOffset;
        const cp2y = toY;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${fromX} ${fromY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toX} ${toY}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(107,122,143,0.5)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '8,4');
        path.classList.add('connection-path');

        this.svg.appendChild(path);
    }

    /**
     * Draw a Bezier connection between two nodes
     * @param {boolean} isVertical - True if this is a row-change connection
     */
    drawConnection(fromNode, toNode, isVertical = false) {
        const fromEl = fromNode.element;
        const toEl = toNode.element;

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const svgRect = this.svg.getBoundingClientRect();

        let fromX, fromY, toX, toY, cp1x, cp1y, cp2x, cp2y;

        if (isVertical) {
            // Vertical connection: bottom of from node to top of to node
            fromX = fromRect.left + fromRect.width / 2 - svgRect.left;
            fromY = fromRect.bottom - svgRect.top;
            toX = toRect.left + toRect.width / 2 - svgRect.left;
            toY = toRect.top - svgRect.top;

            // Vertical bezier control points
            const dy = Math.abs(toY - fromY);
            const controlOffset = Math.min(dy * 0.5, 40);
            cp1x = fromX;
            cp1y = fromY + controlOffset;
            cp2x = toX;
            cp2y = toY - controlOffset;
        } else {
            // Horizontal connection: determine direction based on positions
            const goingRight = toRect.left > fromRect.left;

            if (goingRight) {
                // Left to right: right port of from, left port of to
                fromX = fromRect.right - svgRect.left;
                toX = toRect.left - svgRect.left;
            } else {
                // Right to left: left port of from, right port of to
                fromX = fromRect.left - svgRect.left;
                toX = toRect.right - svgRect.left;
            }
            fromY = fromRect.top + fromRect.height / 2 - svgRect.top;
            toY = toRect.top + toRect.height / 2 - svgRect.top;

            // Horizontal bezier control points
            const dx = Math.abs(toX - fromX);
            const controlOffset = Math.min(dx * 0.5, 80);
            if (goingRight) {
                cp1x = fromX + controlOffset;
                cp2x = toX - controlOffset;
            } else {
                cp1x = fromX - controlOffset;
                cp2x = toX + controlOffset;
            }
            cp1y = fromY;
            cp2y = toY;
        }

        // Determine if both nodes are enabled
        const fromEnabled = !fromEl.classList.contains('disabled');
        const toEnabled = !toEl.classList.contains('disabled');
        const bothEnabled = fromEnabled && toEnabled;

        // Create path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${fromX} ${fromY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toX} ${toY}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', bothEnabled ? 'url(#conn-gradient)' : 'rgba(107,122,143,0.3)');
        path.setAttribute('stroke-width', bothEnabled ? '2' : '1.5');
        path.setAttribute('filter', bothEnabled ? 'url(#conn-glow)' : '');
        path.classList.add('connection-path');

        if (!bothEnabled) {
            path.setAttribute('stroke-dasharray', '5,5');
        }

        this.svg.appendChild(path);

        // Add animated particle for active connections
        if (bothEnabled) {
            this.addParticle(path, fromX, fromY, toX, toY, cp1x, cp1y, cp2x, cp2y);
        }
    }

    /**
     * Add animated particle along connection path
     * @param {string} color - Optional particle color (defaults to gold)
     */
    addParticle(path, x1, y1, x2, y2, cp1x, cp1y, cp2x, cp2y, color = '#d4a853') {
        const isInterGroup = color === '#22d3ee';
        const particle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        particle.setAttribute('r', isInterGroup ? '5' : '3'); // Larger for inter-group
        particle.setAttribute('fill', color);
        particle.classList.add('particle');
        if (isInterGroup) {
            particle.classList.add('inter-group-particle');
        }

        // Create animation
        const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
        animate.setAttribute('dur', isInterGroup ? '1.2s' : '2s'); // Faster for inter-group
        animate.setAttribute('repeatCount', 'indefinite');
        animate.setAttribute('path', `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`);

        particle.appendChild(animate);
        this.svg.appendChild(particle);
    }

    /**
     * Auto-arrange nodes in a grid layout with group awareness
     */
    autoLayout() {
        const nodeArray = Array.from(this.nodes.entries());
        if (nodeArray.length === 0) return;

        // Sync containers first
        this.syncGroupContainers();

        // Check if we have any groups with agents
        const hasGroups = this.groups.length > 0 &&
            nodeArray.some(([_, nodeData]) => nodeData.groupId);

        if (hasGroups) {
            this.autoLayoutWithGroups();
        } else {
            this.autoLayoutFlat();
        }
    }

    /**
     * Flat layout (no groups) - original snake pattern
     */
    autoLayoutFlat() {
        const nodeArray = Array.from(this.nodes.entries());

        // Sort by index
        nodeArray.sort((a, b) => {
            const indexA = parseInt(a[1].element.dataset.index) || 0;
            const indexB = parseInt(b[1].element.dataset.index) || 0;
            return indexA - indexB;
        });

        // Pre-calculate positions and required height
        const totalNodes = nodeArray.length;
        const newPositions = nodeArray.map(([id, nodeData], i) => ({
            id,
            position: this.calculateInitialPosition(i, totalNodes)
        }));

        // Pre-expand canvas to fit all nodes
        const nodeHeight = 80;  // Compact circular node
        const padding = 30;
        const maxY = Math.max(...newPositions.map(p => p.position.y));
        const requiredHeight = maxY + nodeHeight + padding + 30;
        this.space.style.minHeight = `${Math.max(200, requiredHeight)}px`;

        // Animate nodes to new positions
        newPositions.forEach(({ id, position }) => {
            this.animateNodeTo(id, position);
        });
    }

    /**
     * Layout with group containers - positions groups horizontally with ungrouped agents between
     */
    autoLayoutWithGroups() {
        const containerRect = this.space.getBoundingClientRect();
        const padding = 30;
        const groupGap = 50;  // Gap between group containers
        const nodeWidth = 80;   // Compact circular node
        const nodeHeight = 80;  // Circular - same as width
        const nodeGapX = 25;    // Horizontal gap between nodes
        const nodeGapY = 25;    // Vertical gap between nodes
        const headerHeight = 36;
        const containerPadding = 25;

        // Separate grouped and ungrouped agents
        const groupedAgents = new Map(); // groupId -> [nodeData]
        const ungroupedAgents = [];

        this.nodes.forEach((nodeData, agentId) => {
            if (nodeData.groupId) {
                if (!groupedAgents.has(nodeData.groupId)) {
                    groupedAgents.set(nodeData.groupId, []);
                }
                groupedAgents.get(nodeData.groupId).push({ id: agentId, ...nodeData });
            } else {
                ungroupedAgents.push({ id: agentId, ...nodeData });
            }
        });

        // Sort groups by creation date (from this.groups)
        const sortedGroups = this.groups
            .filter(g => groupedAgents.has(g.id))
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        // Calculate positions for each group container
        let currentX = padding;
        let currentRowY = padding;
        let maxRowHeight = 0;
        const availableWidth = containerRect.width - padding * 2;

        const groupPositions = [];
        const allNodePositions = [];

        // Calculate group sizes first to plan layout
        const groupSizes = sortedGroups.map(group => {
            const agents = groupedAgents.get(group.id) || [];
            // Use 2 columns for wider layout within groups
            const columnsInGroup = Math.min(2, agents.length);
            const rowsInGroup = Math.ceil(agents.length / columnsInGroup);
            const groupWidth = columnsInGroup * (nodeWidth + nodeGapX) - nodeGapX + containerPadding * 2;
            const groupHeight = rowsInGroup * (nodeHeight + nodeGapY) - nodeGapY + containerPadding * 2 + headerHeight;
            return { group, agents, columnsInGroup, rowsInGroup, width: groupWidth, height: groupHeight };
        });

        // Calculate ungrouped section size if needed
        let ungroupedWidth = 0;
        let ungroupedHeight = 0;
        let ungroupedColumnsInGroup = 0;
        let ungroupedRowsInGroup = 0;
        if (ungroupedAgents.length > 0) {
            ungroupedColumnsInGroup = Math.min(2, ungroupedAgents.length);
            ungroupedRowsInGroup = Math.ceil(ungroupedAgents.length / ungroupedColumnsInGroup);
            ungroupedWidth = ungroupedColumnsInGroup * (nodeWidth + nodeGapX) - nodeGapX + containerPadding * 2;
            ungroupedHeight = ungroupedRowsInGroup * (nodeHeight + nodeGapY) - nodeGapY + containerPadding * 2 + headerHeight;
        }

        // Position groups horizontally, with ungrouped agents in middle if there are 2+ groups
        const insertUngroupedInMiddle = sortedGroups.length >= 2 && ungroupedAgents.length > 0;
        const middleIndex = Math.floor(sortedGroups.length / 2);

        groupSizes.forEach((groupData, groupIndex) => {
            const { group, agents, columnsInGroup, width: groupWidth, height: groupHeight } = groupData;
            if (agents.length === 0) return;

            // Insert ungrouped agents in the middle
            if (insertUngroupedInMiddle && groupIndex === middleIndex) {
                // Check if ungrouped section fits in current row
                if (currentX + ungroupedWidth > availableWidth && currentX > padding) {
                    currentX = padding;
                    currentRowY += maxRowHeight + groupGap;
                    maxRowHeight = 0;
                }

                // Position ungrouped agents
                ungroupedAgents.sort((a, b) => {
                    const indexA = parseInt(a.element?.dataset?.index) || 0;
                    const indexB = parseInt(b.element?.dataset?.index) || 0;
                    return indexA - indexB;
                });

                ungroupedAgents.forEach((agentData, i) => {
                    const col = i % ungroupedColumnsInGroup;
                    const row = Math.floor(i / ungroupedColumnsInGroup);

                    allNodePositions.push({
                        id: agentData.id,
                        position: {
                            x: currentX + containerPadding + col * (nodeWidth + nodeGapX),
                            y: currentRowY + headerHeight + containerPadding + row * (nodeHeight + nodeGapY)
                        }
                    });
                });

                currentX += ungroupedWidth + groupGap;
                maxRowHeight = Math.max(maxRowHeight, ungroupedHeight);
            }

            // Sort agents within group by index
            agents.sort((a, b) => {
                const indexA = parseInt(a.element?.dataset?.index) || 0;
                const indexB = parseInt(b.element?.dataset?.index) || 0;
                return indexA - indexB;
            });

            // Check if group fits in current row
            if (currentX + groupWidth > availableWidth && currentX > padding) {
                currentX = padding;
                currentRowY += maxRowHeight + groupGap;
                maxRowHeight = 0;
            }

            // Store group position
            const groupX = currentX;
            const groupY = currentRowY;
            groupPositions.push({ groupId: group.id, x: groupX, y: groupY, width: groupWidth, height: groupHeight });

            // Calculate positions for agents within this group (row-first for horizontal layout)
            agents.forEach((agentData, agentIndex) => {
                const col = agentIndex % columnsInGroup;
                const row = Math.floor(agentIndex / columnsInGroup);

                const agentX = groupX + containerPadding + col * (nodeWidth + nodeGapX);
                const agentY = groupY + headerHeight + containerPadding + row * (nodeHeight + nodeGapY);

                allNodePositions.push({
                    id: agentData.id,
                    position: { x: agentX, y: agentY }
                });
            });

            // Update tracking
            currentX += groupWidth + groupGap;
            maxRowHeight = Math.max(maxRowHeight, groupHeight);
        });

        // Position ungrouped agents at the end if not inserted in middle (or if only 1 group)
        if (!insertUngroupedInMiddle && ungroupedAgents.length > 0) {
            // Check if ungrouped section fits in current row
            if (currentX + ungroupedWidth > availableWidth && currentX > padding) {
                currentX = padding;
                currentRowY += maxRowHeight + groupGap;
                maxRowHeight = 0;
            }

            ungroupedAgents.sort((a, b) => {
                const indexA = parseInt(a.element?.dataset?.index) || 0;
                const indexB = parseInt(b.element?.dataset?.index) || 0;
                return indexA - indexB;
            });

            ungroupedAgents.forEach((agentData, i) => {
                const col = i % ungroupedColumnsInGroup;
                const row = Math.floor(i / ungroupedColumnsInGroup);

                allNodePositions.push({
                    id: agentData.id,
                    position: {
                        x: currentX + containerPadding + col * (nodeWidth + nodeGapX),
                        y: currentRowY + headerHeight + containerPadding + row * (nodeHeight + nodeGapY)
                    }
                });
            });
        }

        // Calculate required height
        let maxY = 0;
        allNodePositions.forEach(({ position }) => {
            maxY = Math.max(maxY, position.y + nodeHeight);
        });
        groupPositions.forEach(({ y, height }) => {
            maxY = Math.max(maxY, y + height);
        });

        const requiredHeight = maxY + padding + 50;
        this.space.style.minHeight = `${Math.max(280, requiredHeight)}px`;

        // Animate nodes to new positions
        allNodePositions.forEach(({ id, position }) => {
            this.animateNodeTo(id, position);
        });

        // Update group container bounds after animation
        setTimeout(() => {
            this.groups.forEach(group => {
                this.updateGroupContainerBounds(group.id);
            });
            this.updateConnections();
        }, 450);
    }

    /**
     * Animate a node to a target position
     */
    animateNodeTo(agentId, targetPos) {
        const nodeData = this.nodes.get(agentId);
        if (!nodeData) return;

        const el = nodeData.element;
        el.style.transition = 'left 0.4s cubic-bezier(0.34,1.56,0.64,1), top 0.4s cubic-bezier(0.34,1.56,0.64,1)';
        el.style.left = `${targetPos.x}px`;
        el.style.top = `${targetPos.y}px`;

        nodeData.position = targetPos;

        // Update connections during animation
        const updateInterval = setInterval(() => this.updateConnections(), 16);
        setTimeout(() => {
            clearInterval(updateInterval);
            el.style.transition = '';
            this.updateConnections();

            if (this.onPositionChange) {
                this.onPositionChange(agentId, targetPos);
            }
        }, 400);
    }

    // Mouse event handlers
    onMouseDown(e) {
        // Check for group container header drag
        const groupHeader = e.target.closest('.kb-group-container-header');
        if (groupHeader) {
            const container = groupHeader.closest('.kb-group-container');
            if (container) {
                this.startGroupDrag(container, e.clientX, e.clientY);
                return;
            }
        }

        const nodeEl = e.target.closest('.agent-node-3d');
        if (!nodeEl) return;

        // Don't start drag if clicking on input or buttons
        if (e.target.matches('input, button')) return;

        this.startDrag(nodeEl, e.clientX, e.clientY);
    }

    onMouseMove(e) {
        if (!this.isDragging) return;
        if (this.isDraggingGroup) {
            this.moveGroupDrag(e.clientX, e.clientY);
        } else if (this.dragTarget) {
            this.moveDrag(e.clientX, e.clientY);
        }
    }

    onMouseUp(e) {
        if (this.isDraggingGroup) {
            this.endGroupDrag();
        } else {
            this.endDrag();
        }
    }

    // Touch event handlers
    onTouchStart(e) {
        // Check for group container header drag
        const groupHeader = e.target.closest('.kb-group-container-header');
        if (groupHeader) {
            const container = groupHeader.closest('.kb-group-container');
            if (container) {
                e.preventDefault();
                const touch = e.touches[0];
                this.startGroupDrag(container, touch.clientX, touch.clientY);
                return;
            }
        }

        const nodeEl = e.target.closest('.agent-node-3d');
        if (!nodeEl) return;

        // Don't start drag if touching input or buttons
        if (e.target.matches('input, button')) return;

        e.preventDefault();
        const touch = e.touches[0];
        this.startDrag(nodeEl, touch.clientX, touch.clientY);
    }

    onTouchMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        if (this.isDraggingGroup) {
            this.moveGroupDrag(touch.clientX, touch.clientY);
        } else if (this.dragTarget) {
            this.moveDrag(touch.clientX, touch.clientY);
        }
    }

    onTouchEnd(e) {
        if (this.isDraggingGroup) {
            this.endGroupDrag();
        } else {
            this.endDrag();
        }
    }

    // Drag helper methods
    startDrag(nodeEl, clientX, clientY) {
        this.isDragging = true;
        this.dragTarget = nodeEl;

        const rect = nodeEl.getBoundingClientRect();
        const spaceRect = this.space.getBoundingClientRect();

        this.dragOffset = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };

        // Initialize velocity tracking
        this.velocity = { x: 0, y: 0 };
        this.lastDragPos = { x: clientX, y: clientY };
        this.lastDragTime = performance.now();

        nodeEl.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        // Add wrapper class for grid pulse effect
        if (this.wrapper) {
            this.wrapper.classList.add('dragging-active');
        }

        // Show snap indicator
        this.updateSnapIndicator(this.gridSnapEnabled);

        // Check if shift is already held
        if (this.gridSnapEnabled) {
            nodeEl.classList.add('snap-preview');
        }
    }

    moveDrag(clientX, clientY) {
        if (!this.dragTarget) return;

        const spaceRect = this.space.getBoundingClientRect();
        const nodeRect = this.dragTarget.getBoundingClientRect();
        const nodeWidth = nodeRect.width;
        const nodeHeight = nodeRect.height;

        let x = clientX - spaceRect.left - this.dragOffset.x;
        let y = clientY - spaceRect.top - this.dragOffset.y;

        // Constrain to container
        const padding = 10;
        x = Math.max(padding, Math.min(x, spaceRect.width - nodeWidth - padding));
        y = Math.max(padding, Math.min(y, spaceRect.height - nodeHeight - padding));

        // Apply grid snapping if enabled
        const snapped = this.snapToGrid(x, y);
        x = snapped.x;
        y = snapped.y;

        // Update velocity tracking
        this.updateVelocity(clientX, clientY);

        // Check for alignment with other nodes
        this.checkAlignment(x, y, nodeWidth, nodeHeight);

        this.dragTarget.style.left = `${x}px`;
        this.dragTarget.style.top = `${y}px`;

        // Update node position in map
        const agentId = this.dragTarget.dataset.id;
        if (this.nodes.has(agentId)) {
            this.nodes.get(agentId).position = { x, y };
        }

        this.updateConnections();
    }

    endDrag() {
        if (!this.isDragging) return;

        if (this.dragTarget) {
            this.dragTarget.classList.remove('dragging', 'fast-move', 'snap-preview');

            const agentId = this.dragTarget.dataset.id;
            const nodeData = this.nodes.get(agentId);

            if (nodeData && this.onPositionChange) {
                this.onPositionChange(agentId, nodeData.position);
            }

            // Check if agent was dragged outside its group container
            if (nodeData && nodeData.groupId) {
                const isOutsideGroup = this.isNodeOutsideGroup(nodeData);
                if (isOutsideGroup && this.onUngroupAgent) {
                    // Ungroup the agent
                    const oldGroupId = nodeData.groupId;
                    this.onUngroupAgent(agentId, oldGroupId);
                } else {
                    // Update group container bounds
                    this.updateGroupContainerBounds(nodeData.groupId);
                }
            }

            // Resize canvas in case node was dragged to new position
            this.autoResizeCanvas();
        }

        this.isDragging = false;
        this.dragTarget = null;
        this.velocity = { x: 0, y: 0 };
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Remove wrapper class
        if (this.wrapper) {
            this.wrapper.classList.remove('dragging-active');
        }

        // Hide snap indicator and alignment guides
        this.updateSnapIndicator(false);
        this.hideAllAlignmentGuides();
    }

    /**
     * Check if a node has been dragged outside its group container
     */
    isNodeOutsideGroup(nodeData) {
        if (!nodeData.groupId) return false;

        const containerData = this.groupContainers.get(nodeData.groupId);
        if (!containerData) return false;

        const nodeEl = nodeData.element;
        const containerEl = containerData.element;

        const nodeRect = nodeEl.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();

        // Check if node center is outside container bounds (with some tolerance)
        const nodeCenterX = nodeRect.left + nodeRect.width / 2;
        const nodeCenterY = nodeRect.top + nodeRect.height / 2;

        const tolerance = 20; // px tolerance to avoid accidental ungrouping
        return (
            nodeCenterX < containerRect.left - tolerance ||
            nodeCenterX > containerRect.right + tolerance ||
            nodeCenterY < containerRect.top - tolerance ||
            nodeCenterY > containerRect.bottom + tolerance
        );
    }

    // Group container drag methods
    startGroupDrag(containerEl, clientX, clientY) {
        this.isDragging = true;
        this.isDraggingGroup = true;
        this.dragGroupContainer = containerEl;

        const groupId = containerEl.dataset.groupId;
        this.dragGroupId = groupId;

        const rect = containerEl.getBoundingClientRect();
        const spaceRect = this.space.getBoundingClientRect();

        this.dragOffset = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };

        // Get initial positions of all agents in this group
        this.dragGroupAgentOffsets = [];
        const containerX = parseFloat(containerEl.style.left) || 0;
        const containerY = parseFloat(containerEl.style.top) || 0;

        this.nodes.forEach((nodeData, agentId) => {
            if (nodeData.groupId === groupId) {
                const nodeX = parseFloat(nodeData.element.style.left) || nodeData.position.x;
                const nodeY = parseFloat(nodeData.element.style.top) || nodeData.position.y;
                this.dragGroupAgentOffsets.push({
                    agentId,
                    offsetX: nodeX - containerX,
                    offsetY: nodeY - containerY
                });
            }
        });

        containerEl.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
    }

    moveGroupDrag(clientX, clientY) {
        if (!this.dragGroupContainer) return;

        const spaceRect = this.space.getBoundingClientRect();
        const containerRect = this.dragGroupContainer.getBoundingClientRect();

        let x = clientX - spaceRect.left - this.dragOffset.x;
        let y = clientY - spaceRect.top - this.dragOffset.y;

        // Constrain to canvas
        const padding = 10;
        x = Math.max(padding, Math.min(x, spaceRect.width - containerRect.width - padding));
        y = Math.max(padding, Math.min(y, spaceRect.height - containerRect.height - padding));

        // Move the container (without transition during drag)
        this.dragGroupContainer.style.transition = 'none';
        this.dragGroupContainer.style.left = `${x}px`;
        this.dragGroupContainer.style.top = `${y}px`;

        // Move all agents within the group
        this.dragGroupAgentOffsets.forEach(({ agentId, offsetX, offsetY }) => {
            const nodeData = this.nodes.get(agentId);
            if (nodeData) {
                const newX = x + offsetX;
                const newY = y + offsetY;
                nodeData.element.style.transition = 'none';
                nodeData.element.style.left = `${newX}px`;
                nodeData.element.style.top = `${newY}px`;
                nodeData.position = { x: newX, y: newY };
            }
        });

        this.updateConnections();
    }

    endGroupDrag() {
        if (!this.isDraggingGroup) return;

        if (this.dragGroupContainer) {
            this.dragGroupContainer.classList.remove('dragging');
            // Restore transition
            this.dragGroupContainer.style.transition = '';

            // Restore transitions for all agents in the group
            this.dragGroupAgentOffsets.forEach(({ agentId }) => {
                const nodeData = this.nodes.get(agentId);
                if (nodeData) {
                    nodeData.element.style.transition = '';
                    if (this.onPositionChange) {
                        this.onPositionChange(agentId, nodeData.position);
                    }
                }
            });

            // Resize canvas
            this.autoResizeCanvas();
        }

        this.isDragging = false;
        this.isDraggingGroup = false;
        this.dragGroupContainer = null;
        this.dragGroupId = null;
        this.dragGroupAgentOffsets = [];
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    /**
     * Clear all nodes
     */
    clear() {
        this.nodes.forEach((nodeData, id) => {
            nodeData.element.remove();
        });
        this.nodes.clear();
        this.autoResizeCanvas();
        this.updateConnections();

        if (this.emptyState) {
            this.emptyState.style.display = 'flex';
        }
        if (this.wrapper) {
            this.wrapper.classList.remove('has-nodes');
        }
    }

    /**
     * Escape HTML for safe rendering
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Destroy the canvas instance
     */
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        this.clear();
    }
}

export { KBCanvas };

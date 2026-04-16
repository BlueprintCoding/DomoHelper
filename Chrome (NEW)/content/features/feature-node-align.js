// content/features/feature-node-align.js
// Magic ETL Node Alignment Feature
// Allows aligning and distributing selected nodes on the canvas by emulating drag operations

/**
 * Debug function to inspect node and React Flow state
 */
function inspectNodeDragState() {
  const selectedNodes = getSelectedNodes();
  console.log('[Node Align DEBUG] Selected nodes:', selectedNodes.length);
  
  selectedNodes.forEach((node, idx) => {
    const info = getNodeInfo(node);
    console.log(`[Node Align DEBUG] Node ${idx}:`, {
      id: info.id,
      x: info.x,
      y: info.y,
      classes: node.className,
      dataTestId: node.getAttribute('data-testid')
    });
    
    // Look for event listeners
    const eventKeys = Object.keys(node).filter(k => k.includes('__react') || k.includes('__event'));
    console.log('[Node Align DEBUG] Event-related properties:', eventKeys);
  });
  
  // Check for React Flow instance
  const reactFlow = document.querySelector('[class*="ReactFlow"]');
  console.log('[Node Align DEBUG] React Flow container found:', !!reactFlow);
  
  // Check for canvas
  const canvas = document.querySelector('[class*="ReactFlow"] canvas');
  console.log('[Node Align DEBUG] Canvas found:', !!canvas);
  
  return {
    selectedNodeCount: selectedNodes.length,
    reactFlowFound: !!reactFlow,
    canvasFound: !!canvas
  };
}

/**
 * Get all selected nodes from the canvas
 * @returns {Array} Array of selected node elements
 */
function getSelectedNodes() {
  // Look for selected nodes - they have the 'selected' class
  const selectedNodes = document.querySelectorAll('[data-testid^="rf__node-"].selected');
  return Array.from(selectedNodes);
}

/**
 * Extract node position and dimensions
 * @param {HTMLElement} node - Node element
 * @returns {Object} Object with id, x, y, width, height, element
 */
function getNodeInfo(node) {
  const transform = node.style.transform;
  const match = transform.match(/translate\(([^p]+)px,\s*([^p]+)px\)/);
  const x = match ? parseFloat(match[1]) : 0;
  const y = match ? parseFloat(match[2]) : 0;
  
  const rect = node.getBoundingClientRect();
  const dataId = node.getAttribute('data-id');
  
  return {
    id: dataId,
    x: x,
    y: y,
    width: rect.width || 64,
    height: rect.height || 64,
    element: node
  };
}

/**
 * Get nodes sorted by connection order if they're directly connected, otherwise by position
 * @param {Array} nodeInfoArray - Array of node info objects
 * @returns {Array} Nodes ordered by connection chain or position
 */
function orderNodesByConnection(nodeInfoArray) {
  if (nodeInfoArray.length < 2) {
    return nodeInfoArray;
  }
  
  // Build a map of connections from edges in the DOM
  const edgeElements = document.querySelectorAll('[data-testid^="rf__edge-"]');
  const connections = {}; // { fromNodeId: toNodeId }
  const nodeIds = new Set(nodeInfoArray.map(n => n.id));
  
  edgeElements.forEach(edge => {
    const testId = edge.getAttribute('data-testid');
    // Format: rf__edge-{fromId}_{toId}
    // Handle node IDs that may contain underscores by finding the correct split point
    const match = testId.match(/^rf__edge-(.+)$/);
    if (match) {
      const edgeIdContent = match[1];
      // Try to find which selected node IDs this edge connects
      for (const fromId of nodeIds) {
        if (edgeIdContent.startsWith(fromId + '_')) {
          const toId = edgeIdContent.slice(fromId.length + 1);
          // Only track connections between selected nodes
          if (nodeIds.has(toId)) {
            connections[fromId] = toId;
            break;
          }
        }
      }
    }
  });
  
  // Find the root node (no incoming connection from selected nodes)
  const hasIncoming = new Set(Object.values(connections));
  let rootNode = null;
  for (const node of nodeInfoArray) {
    if (!hasIncoming.has(node.id)) {
      rootNode = node;
      break;
    }
  }
  
  // If no root found (circular or disconnected), use first by position
  if (!rootNode) {
    return nodeInfoArray;
  }
  
  // Build ordered chain starting from root
  const ordered = [rootNode];
  let currentId = rootNode.id;
  
  while (connections[currentId]) {
    const nextId = connections[currentId];
    const nextNode = nodeInfoArray.find(n => n.id === nextId);
    if (nextNode) {
      ordered.push(nextNode);
      currentId = nextId;
    } else {
      break;
    }
  }
  
  // Add any remaining unconnected nodes
  for (const node of nodeInfoArray) {
    if (!ordered.includes(node)) {
      ordered.push(node);
    }
  }
  
  return ordered;
}

/**
 * Check if node drag is actually happening by looking at position changes
 */
function hasNodeMoved(node, originalTransform) {
  return node.style.transform !== originalTransform;
}

/**
 * Click on canvas background to deselect all nodes and prevent accidentally opening action panels
 */
function clickCanvasBackground() {
  return new Promise((resolve) => {
    setTimeout(() => {
      const canvasPane = document.querySelector('.react-flow__pane');
      console.log('[Node Align] clickCanvasBackground: Looking for .react-flow__pane, found:', !!canvasPane);
      
      if (!canvasPane) {
        console.log('[Node Align] WARNING: Could not find canvas pane element!');
        setTimeout(resolve, 100);
        return;
      }
      
      const paneBounds = canvasPane.getBoundingClientRect();
      const clickX = Math.round(paneBounds.left + 10);
      const clickY = Math.round(paneBounds.top + 10);
      console.log(`[Node Align] Dispatching right-click (contextmenu) at (${clickX}, ${clickY}) on .react-flow__pane`);
      
      // Right-click (contextmenu event) triggers deselection in react-flow
      const contextMenuEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: clickX,
        clientY: clickY,
        screenX: clickX,
        screenY: clickY,
        pageX: clickX,
        pageY: clickY,
        button: 2,
        buttons: 2
      });
      canvasPane.dispatchEvent(contextMenuEvent);
      console.log('[Node Align] contextmenu (right-click) dispatched');
      
      setTimeout(resolve, 100);
    }, 50);
  });
}

/**
 * Simulate dragging a node to a new position
 * Uses drag events that React Flow actually recognizes
 * @param {HTMLElement} node - Node element to drag
 * @param {number} deltaX - Delta movement in X
 * @param {number} deltaY - Delta movement in Y
 */
function emulationDragNode(node, fromX, fromY, toX, toY) {
  return new Promise((resolve) => {
    const deltaX = toX - fromX;
    const deltaY = toY - fromY;
    
    if (deltaX === 0 && deltaY === 0) {
      console.log('[Node Align] No movement needed');
      resolve();
      return;
    }
    
    // Get current screen position
    const nodeRect = node.getBoundingClientRect();
    const startScreenX = nodeRect.left + nodeRect.width / 2;
    const startScreenY = nodeRect.top + nodeRect.height / 2;
    
    // Calculate zoom level by comparing canvas size to screen size
    // This handles pan/zoom transformations in React Flow
    const canvasWidth = Math.max(node.offsetWidth, 64); // fallback to 64px
    const screenWidth = nodeRect.width;
    const zoom = screenWidth > 0 ? screenWidth / canvasWidth : 1;
    
    // Convert canvas deltas to screen deltas using zoom level
    const screenDeltaX = deltaX * zoom;
    const screenDeltaY = deltaY * zoom;
    const endScreenX = startScreenX + screenDeltaX;
    const endScreenY = startScreenY + screenDeltaY;
    
    const originalTransform = node.style.transform;
    
    let didMove = false;
    
    console.log(`[Node Align] Attempting drag: canvas delta=(${deltaX.toFixed(0)}, ${deltaY.toFixed(0)}), screen start=(${startScreenX.toFixed(0)}, ${startScreenY.toFixed(0)}), screen end=(${endScreenX.toFixed(0)}, ${endScreenY.toFixed(0)})`);
    
    // Target the innermost draggable element
    const draggableElement = node.querySelector('[class*="DfNode_node_"]') || 
                             node.querySelector('div[class*="node"]') ||
                             node;
    
    // Get all potential event targets
    const eventTargets = [draggableElement, node, document, window];
    const canvas = document.querySelector('canvas');
    if (canvas) eventTargets.push(canvas);
    
    // Create a shared tracking object to detect if React Flow handles the events
    const dragTracker = { startX: startScreenX, startY: startScreenY, currentX: startScreenX, currentY: startScreenY };
    
    // Step 1: Dispatch mousedown with all event properties
    const createDownEvent = (x, y) => {
      return {
        pointerdown: new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, composed: true,
          view: window, clientX: x, clientY: y, screenX: x, screenY: y,
          pageX: x, pageY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true,
          buttons: 1, button: 0
        }),
        mousedown: new MouseEvent('mousedown', {
          bubbles: true, cancelable: true, composed: true,
          view: window, clientX: x, clientY: y, screenX: x, screenY: y,
          pageX: x, pageY: y, buttons: 1, button: 0
        })
      };
    };
    
    const downEvents = createDownEvent(startScreenX, startScreenY);
    eventTargets.forEach(target => {
      if (target) {
        Object.values(downEvents).forEach(evt => {
          try { target.dispatchEvent(evt); } catch (e) {}
        });
      }
    });
    
    console.log('[Node Align] Dispatched down events');
    
    // Add minimal delay, then start generating move events
    setTimeout(() => {
      let moveCount = 0;
      const screenDistance = Math.sqrt(screenDeltaX * screenDeltaX + screenDeltaY * screenDeltaY);
      const steps = Math.max(screenDistance / 8, 1) || 1;
      const stepX = screenDeltaX / steps;
      const stepY = screenDeltaY / steps;
      
      const moveInterval = setInterval(() => {
        moveCount++;
        dragTracker.currentX += stepX;
        dragTracker.currentY += stepY;
        
        const moveEvents = {
          pointermove: new PointerEvent('pointermove', {
            bubbles: true, cancelable: true, composed: true,
            view: window, clientX: dragTracker.currentX, clientY: dragTracker.currentY,
            screenX: dragTracker.currentX, screenY: dragTracker.currentY,
            pageX: dragTracker.currentX, pageY: dragTracker.currentY,
            pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1
          }),
          mousemove: new MouseEvent('mousemove', {
            bubbles: true, cancelable: true, composed: true,
            view: window, clientX: dragTracker.currentX, clientY: dragTracker.currentY,
            screenX: dragTracker.currentX, screenY: dragTracker.currentY,
            pageX: dragTracker.currentX, pageY: dragTracker.currentY,
            buttons: 1, button: 0
          })
        };
        
        eventTargets.forEach(target => {
          if (target) {
            Object.values(moveEvents).forEach(evt => {
              try { 
                const result = target.dispatchEvent(evt);
                if (!result) evt.preventDefault();
              } catch (e) {}
            });
          }
        });
        
        if (moveCount >= steps) {
          clearInterval(moveInterval);
          
          setTimeout (() => {
            const upEvents = {
              pointerup: new PointerEvent('pointerup', {
                bubbles: true, cancelable: true, composed: true,
                view: window, clientX: endScreenX, clientY: endScreenY,
                screenX: endScreenX, screenY: endScreenY, pageX: endScreenX, pageY: endScreenY,
                pointerId: 1, pointerType: 'mouse', isPrimary: true
              }),
              mouseup: new MouseEvent('mouseup', {
                bubbles: true, cancelable: true, composed: true,
                view: window, clientX: endScreenX, clientY: endScreenY,
                screenX: endScreenX, screenY: endScreenY, pageX: endScreenX, pageY: endScreenY
              })
            };
            
            eventTargets.forEach(target => {
              if (target) {
                Object.values(upEvents).forEach(evt => {
                  try { target.dispatchEvent(evt); } catch (e) {}
                });
              }
            });
            
            // Don't resolve until the node has ACTUALLY MOVED
            // This ensures React Flow finishes processing before next drag starts
            const startWait = Date.now();
            const maxWait = 200; // Timeout if React Flow doesn't update in 200ms
            let initialDelay = true;
            
            const checkMove = () => {
              // Add small initial delay to let React Flow process the events
              if (initialDelay) {
                initialDelay = false;
                setTimeout(checkMove, 5);
                return;
              }
              
              didMove = hasNodeMoved(node, originalTransform);
              const elapsed = Date.now() - startWait;
              
              if (didMove) {
                console.log('[Node Align] Node moved! Resolved after', elapsed, 'ms');
                resolve();
              } else if (elapsed >= maxWait) {
                console.log('[Node Align] Timeout waiting for node to move (', elapsed, 'ms). Proceeding anyway.');
                resolve();
              } else {
                // Keep checking - node hasn't moved yet (poll every 10ms)
                setTimeout(checkMove, 10);
              }
            };
            
            checkMove();
          }, 15);
        }
      }, 10);
    }, 5);
  });
}

/**
 * Align selected nodes vertically (align top edges)
 * Uses parent node from connection chain if available
 */
async function alignNodesVertically() {
  const nodes = getSelectedNodes();
  if (nodes.length < 2) {
    console.warn('[Node Align] Select at least 2 nodes to align vertically');
    return false;
  }

  // Deselect all nodes first so dragging one doesn't drag all of them
  console.log('[Node Align] Deselecting all nodes first to prevent multi-node drag...');
  await clickCanvasBackground();
  await new Promise(resolve => setTimeout(resolve, 20));

  let nodesInfo = nodes.map(getNodeInfo);
  
  // Order by connection chain if available to find the parent node
  nodesInfo = orderNodesByConnection(nodesInfo);
  
  const minY = nodesInfo[0].y; // Align all to the first node (parent/topmost)

  let anyNodeMoved = false;

  // Emulate dragging each node to its new position
  for (const node of nodesInfo) {
    const currentInfo = getNodeInfo(node.element); // Re-extract current position
    const snappedTargetY = Math.round(minY / 32) * 32; // Snap target to canvas grid
    if (snappedTargetY !== currentInfo.y) {
      await emulationDragNode(node.element, currentInfo.x, currentInfo.y, currentInfo.x, snappedTargetY);
      anyNodeMoved = true;
    }
  }

  console.log('[Node Align] ✓ Nodes aligned vertically (top edges at Y=' + minY + ', respecting connection order)');
  
  return true;
}

/**
 * Align selected nodes horizontally (align left edges)
 * Uses parent node from connection chain if available
 */
async function alignNodesHorizontally() {
  const nodes = getSelectedNodes();
  if (nodes.length < 2) {
    console.warn('[Node Align] Select at least 2 nodes to align horizontally');
    return false;
  }

  // Deselect all nodes first so dragging one doesn't drag all of them
  console.log('[Node Align] Deselecting all nodes first to prevent multi-node drag...');
  await clickCanvasBackground();
  await new Promise(resolve => setTimeout(resolve, 20));

  let nodesInfo = nodes.map(getNodeInfo);
  
  // Order by connection chain if available to find the parent node
  nodesInfo = orderNodesByConnection(nodesInfo);
  
  const minX = nodesInfo[0].x; // Align all to the first node (parent/leftmost)

  let anyNodeMoved = false;

  // Emulate dragging each node to its new position
  for (const node of nodesInfo) {
    const currentInfo = getNodeInfo(node.element); // Re-extract current position
    const snappedTargetX = Math.round(minX / 32) * 32; // Snap target to canvas grid
    if (snappedTargetX !== currentInfo.x) {
      await emulationDragNode(node.element, currentInfo.x, currentInfo.y, snappedTargetX, currentInfo.y);
      anyNodeMoved = true;
    }
  }

  console.log('[Node Align] ✓ Nodes aligned horizontally (left edges at X=' + minX + ', respecting connection order)');
  
  return true;
}

/**
 * Distribute selected nodes evenly vertically with 100px spacing, reference from topmost node
 * Respects connection order if nodes are directly connected
 */
async function distributeNodesVertically() {
  const nodes = getSelectedNodes();
  if (nodes.length < 3) {
    console.warn('[Node Align] Select at least 3 nodes to distribute vertically');
    return false;
  }

  // Deselect all nodes first so dragging one doesn't drag all of them
  console.log('[Node Align] Deselecting all nodes first to prevent multi-node drag...');
  await clickCanvasBackground();
  await new Promise(resolve => setTimeout(resolve, 20));

  let nodesInfo = nodes.map(getNodeInfo);
  
  // Order by connection chain if available
  nodesInfo = orderNodesByConnection(nodesInfo);

  const referenceY = nodesInfo[0].y; // Use first node (root or topmost)
  const GAP = 100; // 100px gap between nodes

  let anyNodeMoved = false;

  // Emulate dragging each node to its new position
  for (let i = 0; i < nodesInfo.length; i++) {
    const node = nodesInfo[i];
    const currentInfo = getNodeInfo(node.element); // Re-extract current position
    const newY = referenceY + (i * GAP);
    const snappedTargetY = Math.round(newY / 32) * 32; // Snap target to canvas grid
    
    if (snappedTargetY !== currentInfo.y) {
      await emulationDragNode(node.element, currentInfo.x, currentInfo.y, currentInfo.x, snappedTargetY);
      anyNodeMoved = true;
    }
  }

  console.log('[Node Align] ✓ Nodes distributed vertically with 100px spacing (respecting connection order)');
  
  return true;
}

/**
 * Distribute selected nodes evenly horizontally with 100px spacing, reference from leftmost node
 * Respects connection order if nodes are directly connected
 */
async function distributeNodesHorizontally() {
  const nodes = getSelectedNodes();
  if (nodes.length < 3) {
    console.warn('[Node Align] Select at least 3 nodes to distribute horizontally');
    return false;
  }

  // Deselect all nodes first so dragging one doesn't drag all of them
  console.log('[Node Align] Deselecting all nodes first to prevent multi-node drag...');
  await clickCanvasBackground();
  await new Promise(resolve => setTimeout(resolve, 20));

  let nodesInfo = nodes.map(getNodeInfo);
  
  // Order by connection chain if available
  nodesInfo = orderNodesByConnection(nodesInfo);

  const referenceX = nodesInfo[0].x; // Use first node (root or leftmost)
  const GAP = 100; // 100px gap between nodes

  let anyNodeMoved = false;

  // Emulate dragging each node to its new position
  for (let i = 0; i < nodesInfo.length; i++) {
    const node = nodesInfo[i];
    const currentInfo = getNodeInfo(node.element); // Re-extract current position
    const newX = referenceX + (i * GAP);
    const snappedTargetX = Math.round(newX / 32) * 32; // Snap target to canvas grid
    
    if (snappedTargetX !== currentInfo.x) {
      await emulationDragNode(node.element, currentInfo.x, currentInfo.y, snappedTargetX, currentInfo.y);
      anyNodeMoved = true;
    }
  }

  console.log('[Node Align] ✓ Nodes distributed horizontally with 100px spacing (respecting connection order)');
  
  return true;
}

/**
 * Center selected nodes vertically around the average center, distributed horizontally with 100px spacing
 * Respects connection order if nodes are directly connected
 */
async function centerNodesVertically() {
  const nodes = getSelectedNodes();
  if (nodes.length < 2) {
    console.warn('[Node Align] Select at least 2 nodes to center vertically');
    return false;
  }

  // Deselect all nodes first so dragging one doesn't drag all of them
  console.log('[Node Align] Deselecting all nodes first to prevent multi-node drag...');
  await clickCanvasBackground();
  await new Promise(resolve => setTimeout(resolve, 20));

  let nodesInfo = nodes.map(getNodeInfo);
  
  // Order nodes by connection chain if connected, otherwise by X position
  nodesInfo = orderNodesByConnection(nodesInfo);
  
  // Re-extract current positions to check alignment
  const currentPositions = nodesInfo.map(n => getNodeInfo(n.element));
  
  // Get snapped Y positions
  const snappedYPositions = currentPositions.map(pos => Math.round(pos.y / 32) * 32);
  const firstSnappedY = snappedYPositions[0];
  
  // Check if all nodes are already vertically aligned (all at same snapped Y)
  const allAligned = snappedYPositions.every(y => y === firstSnappedY);
  
  console.log('[Node Align DEBUG CENTER V] snappedY positions: ' + snappedYPositions.join(', ') + ', allAligned=' + allAligned);
  
  // If all nodes are already aligned, don't move them
  if (allAligned) {
    console.log('[Node Align] ✓ Nodes already centered vertically - no changes needed');
    return true;
  }
  
  // Calculate average center Y position for unaligned nodes
  const centerY = Math.round(currentPositions.reduce((sum, pos) => sum + (pos.y + pos.height / 2), 0) / currentPositions.length);
  
  // Use the first node (root of connection chain or leftmost) as the reference for X position - snap to grid
  const referenceX = Math.round(currentPositions[0].x / 32) * 32; // Snap to grid for consistency
  const GAP = 100; // 100px gap between nodes

  let anyNodeMoved = false;

  // Emulate dragging each node to its new position
  for (let i = 0; i < currentPositions.length; i++) {
    const currentInfo = currentPositions[i];
    const newX = referenceX + (i * GAP);
    const newY = centerY - Math.round(currentInfo.height / 2);
    const snappedTargetX = Math.round(newX / 32) * 32; // Snap target to canvas grid
    const snappedTargetY = Math.round(newY / 32) * 32; // Snap target to canvas grid
    
    if (snappedTargetX !== currentInfo.x || snappedTargetY !== currentInfo.y) {
      await emulationDragNode(currentInfo.element, currentInfo.x, currentInfo.y, snappedTargetX, snappedTargetY);
      anyNodeMoved = true;
    }
  }

  console.log('[Node Align] ✓ Nodes centered vertically (Y=' + centerY + '), spaced horizontally by 100px (respecting connection order)');
  
  return true;
}

/**
 * Center selected nodes horizontally around the average center, all at same X position
 * Respects connection order if nodes are directly connected (for ordering purposes only)
 */
async function centerNodesHorizontally() {
  const nodes = getSelectedNodes();
  if (nodes.length < 2) {
    console.warn('[Node Align] Select at least 2 nodes to center horizontally');
    return false;
  }

  // CRITICAL: Deselect all nodes first so dragging one doesn't drag all of them
  console.log('[Node Align CENTER H] Deselecting all nodes first to prevent multi-node drag...');
  await clickCanvasBackground();
  await new Promise(resolve => setTimeout(resolve, 20));

  let nodesInfo = nodes.map(getNodeInfo);
  
  // Order nodes by connection chain if connected (for logical ordering)
  nodesInfo = orderNodesByConnection(nodesInfo);
  
  // STORE NODE IDs FOR STABLE IDENTIFICATION (not element references)
  const nodeIds = nodesInfo.map(n => n.id);
  
  // Re-extract all current positions to check initial alignment
  let currentPositions = nodesInfo.map(n => getNodeInfo(n.element));
  
  // Log existing positions of all nodes BEFORE any movement
  console.log('[Node Align CENTER H] === INITIAL NODE POSITIONS ===');
  for (let i = 0; i < currentPositions.length; i++) {
    const pos = currentPositions[i];
    console.log(`[Node Align CENTER H] Node ${i} (id=${nodeIds[i]}): X=${pos.x}, Y=${pos.y}, width=${pos.width}, height=${pos.height}`);
  }
  
  // Get snapped X positions to check alignment
  const snappedXPositions = currentPositions.map(pos => Math.round(pos.x / 32) * 32);
  const firstSnappedX = snappedXPositions[0];
  
  // Check if all nodes are already horizontally aligned (all at same snapped X)
  const allAligned = snappedXPositions.every(x => x === firstSnappedX);
  
  console.log('[Node Align CENTER H] snappedX positions: ' + snappedXPositions.join(', ') + ', allAligned=' + allAligned);
  
  // If already aligned, don't move anything
  if (allAligned) {
    console.log('[Node Align] ✓ Nodes already centered horizontally - no changes needed');
    return true;
  }
  
  // Use first node's position as static reference - snap to grid for consistency
  const referenceX = Math.round(currentPositions[0].x / 32) * 32; // Snap to grid
  const referenceY = Math.round(currentPositions[0].y / 32) * 32; // Snap to grid
  const GAP = 100; // 100px gap between nodes

  let anyNodeMoved = false;
  
  console.log(`[Node Align CENTER H] Reference node (0) at X=${referenceX}, Y=${referenceY} (grid-aligned, FIXED for entire operation)`);
  
  // Move nodes 1, 2, 3... to align with node 0's X position, spaced vertically
  for (let i = 1; i < nodeIds.length; i++) {
    // RE-FETCH the node element FRESH from DOM using its stable ID
    const nodeElement = document.querySelector(`[data-id="${nodeIds[i]}"]`);
    if (!nodeElement) {
      console.error(`[Node Align CENTER H] Node ${i} with id=${nodeIds[i]} not found in DOM!`);
      continue;
    }
    
    // Verify we got the right node by checking its data-id attribute
    const actualId = nodeElement.getAttribute('data-id');
    console.log(`[Node Align CENTER H] *** MOVING INDEX ${i}: Expected id=${nodeIds[i]}, Actual element id=${actualId}, MATCH=${nodeIds[i] === actualId}`);
    
    // RE-EXTRACT current position for this node (fresh from DOM/React Flow)
    const currentInfo = getNodeInfo(nodeElement);
    
    console.log(`[Node Align CENTER H] Node ${i} (id=${nodeIds[i]}): element found, extracted X=${currentInfo.x}, Y=${currentInfo.y}`);
    
    const newX = referenceX; // Align to node 0's ORIGINAL X (never changes)
    const newY = referenceY + (i * GAP); // Space vertically from node 0's ORIGINAL Y
    
    const snappedTargetX = Math.round(newX / 32) * 32;
    const snappedTargetY = Math.round(newY / 32) * 32;
    
    console.log(`[Node Align CENTER H] Node ${i}: currentX=${currentInfo.x.toFixed(0)}, targetX=${snappedTargetX}, currentY=${currentInfo.y.toFixed(0)}, targetY=${snappedTargetY}`);
    
    // Only move if position differs from target (respecting snap grid)
    if (snappedTargetX !== currentInfo.x || snappedTargetY !== currentInfo.y) {
      console.log(`[Node Align CENTER H] Moving node ${i} from (${currentInfo.x}, ${currentInfo.y}) to (${snappedTargetX}, ${snappedTargetY})`);
      await emulationDragNode(currentInfo.element, currentInfo.x, currentInfo.y, snappedTargetX, snappedTargetY);
      anyNodeMoved = true;
    } else {
      console.log(`[Node Align CENTER H] Node ${i} already at target, skipping`);
    }
  }

  console.log('[Node Align] ✓ Nodes centered horizontally at X=' + referenceX + ', spaced vertically by ' + GAP + 'px');
  
  return true;
}

// Export the feature
export default {
  init: () => {
    console.log('[Node Align] ✓ Feature loaded');
  },
  centerNodesVertically,
  centerNodesHorizontally,
  getSelectedNodes,
  getSelectedNodesInfo,
  getNodeInfo,
  inspectNodeDragState
};


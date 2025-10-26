const { getEventCollection } = require('./events');

// Calculate influence spreading for specific event
const calculateEventInfluence = async (eventId, query) => {
  const { maxDepth = 3 } = query;
  const eventCollection = getEventCollection();
  
  const influence = await eventCollection.calculateEventInfluence(eventId, parseInt(maxDepth));
  
  return {
    ...influence,
    analysis: analyzeInfluencePattern(influence),
    recommendations: generateInfluenceRecommendations(influence)
  };
};

// Global influence analysis
const performGlobalAnalysis = async () => {
  const eventCollection = getEventCollection();
  const events = await eventCollection.getAllEvents();
  const globalAnalysis = {
    totalEvents: events.length,
    influenceMap: new Map(),
    topInfluencers: [],
    influenceDistribution: {
      high: 0,
      medium: 0,
      low: 0
    }
  };
  
  // Calculate influence for all events
  for (const event of events) {
    try {
      const influence = await eventCollection.calculateEventInfluence(event.eventId, 3);
      globalAnalysis.influenceMap.set(event.eventId, influence.totalInfluence);
    } catch (error) {
      console.warn(`Failed to calculate influence for event ${event.eventId}: ${error.message}`);
    }
  }
  
  // Find top influencers
  const sortedInfluences = Array.from(globalAnalysis.influenceMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  globalAnalysis.topInfluencers = await Promise.all(
    sortedInfluences.map(async ([eventId, influence]) => ({
      eventId,
      influence,
      event: (await eventCollection.getEvent(eventId))?.toObject()
    }))
  );
  
  // Calculate influence distribution
  const influences = Array.from(globalAnalysis.influenceMap.values());
  const maxInfluence = Math.max(...influences);
  const thresholdHigh = maxInfluence * 0.7;
  const thresholdMedium = maxInfluence * 0.4;
  
  influences.forEach(influence => {
    if (influence >= thresholdHigh) {
      globalAnalysis.influenceDistribution.high++;
    } else if (influence >= thresholdMedium) {
      globalAnalysis.influenceDistribution.medium++;
    } else {
      globalAnalysis.influenceDistribution.low++;
    }
  });
  
  return {
    ...globalAnalysis,
    statistics: {
      averageInfluence: influences.reduce((sum, inf) => sum + inf, 0) / influences.length,
      maxInfluence,
      minInfluence: Math.min(...influences),
      influenceVariance: calculateVariance(influences)
    },
    recommendations: generateGlobalInfluenceRecommendations(globalAnalysis)
  };
};

// Simulate influence changes
const simulateInfluenceChanges = (simulationData) => {
  const { eventId, affectedEvents } = simulationData;
  const eventCollection = getEventCollection();
  
  if (!eventId) {
    throw new Error('Missing required field: eventId');
  }
  
  const event = eventCollection.getEvent(eventId);
  if (!event) {
    throw new Error('Event not found');
  }
  
  // Calculate original influence
  const originalInfluence = eventCollection.calculateEventInfluence(eventId, 3);
  
  // Create temporary event
  const tempEvent = {
    ...event.toObject()
  };
  
  // Create temporary collection for simulation
  const { EventCollection } = require('../models/Event');
  const tempCollection = new EventCollection();
  eventCollection.getAllEvents().forEach(e => {
    if (e.eventId === eventId) {
      tempCollection.addEvent(tempEvent);
    } else {
      tempCollection.addEvent(e.toObject());
    }
  });
  
  // Calculate new influence
  const newInfluence = tempCollection.calculateEventInfluence(eventId, 3);
  
  // Calculate impact on affected events
  const impactAnalysis = [];
  if (affectedEvents && Array.isArray(affectedEvents)) {
    affectedEvents.forEach(affectedEventId => {
      try {
        const originalAffectedInfluence = eventCollection.calculateEventInfluence(affectedEventId, 3);
        const newAffectedInfluence = tempCollection.calculateEventInfluence(affectedEventId, 3);
        
        impactAnalysis.push({
          eventId: affectedEventId,
          originalInfluence: originalAffectedInfluence.totalInfluence,
          newInfluence: newAffectedInfluence.totalInfluence,
          change: newAffectedInfluence.totalInfluence - originalAffectedInfluence.totalInfluence,
          changePercentage: ((newAffectedInfluence.totalInfluence - originalAffectedInfluence.totalInfluence) / originalAffectedInfluence.totalInfluence) * 100
        });
      } catch (error) {
        console.warn(`Failed to calculate impact for event ${affectedEventId}: ${error.message}`);
      }
    });
  }
  
  return {
    simulation: {
      eventId,
      originalInfluence: originalInfluence.totalInfluence,
      newInfluence: newInfluence.totalInfluence,
      influenceChange: newInfluence.totalInfluence - originalInfluence.totalInfluence,
      influenceChangePercentage: ((newInfluence.totalInfluence - originalInfluence.totalInfluence) / originalInfluence.totalInfluence) * 100
    },
    impactAnalysis,
    recommendations: generateSimulationRecommendations(originalInfluence, newInfluence)
  };
};

// Get influence network visualization data
const getInfluenceNetwork = (eventId, query) => {
  const { maxDepth = 2 } = query;
  const eventCollection = getEventCollection();
  
  const influence = eventCollection.calculateEventInfluence(eventId, parseInt(maxDepth));
  
  // Create network nodes and edges
  const nodes = [];
  const edges = [];
  
  // Add source event as central node
  nodes.push({
    id: eventId,
    label: influence.sourceEvent.eventName,
    group: 'source'
  });
  
  // Add influenced events as nodes
  influence.influenceMap.forEach(item => {
    if (item.eventId !== eventId) {
      nodes.push({
        id: item.eventId,
        label: item.event.eventName,
        value: item.influence,
        group: 'influenced',
        influence: item.influence
      });
      
      // Add edge from source to influenced event
      edges.push({
        from: eventId,
        to: item.eventId,
        value: item.influence,
        label: `${item.influence.toFixed(2)}`
      });
    }
  });
  
  return {
    network: {
      nodes,
      edges
    },
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      maxInfluence: Math.max(...nodes.map(n => n.influence)),
      minInfluence: Math.min(...nodes.map(n => n.influence))
    }
  };
};

// Helper functions
function analyzeInfluencePattern(influence) {
  const influences = influence.influenceMap.map(item => item.influence);
  const maxInfluence = Math.max(...influences);
  const minInfluence = Math.min(...influences);
  const avgInfluence = influences.reduce((sum, inf) => sum + inf, 0) / influences.length;
  
  return {
    maxInfluence,
    minInfluence,
    averageInfluence: avgInfluence,
    influenceRange: maxInfluence - minInfluence,
    influenceVariance: calculateVariance(influences),
    distribution: {
      high: influences.filter(inf => inf >= maxInfluence * 0.7).length,
      medium: influences.filter(inf => inf >= maxInfluence * 0.4 && inf < maxInfluence * 0.7).length,
      low: influences.filter(inf => inf < maxInfluence * 0.4).length
    }
  };
}

function generateInfluenceRecommendations(influence) {
  const recommendations = [];
  const analysis = analyzeInfluencePattern(influence);
  
  if (analysis.maxInfluence > analysis.averageInfluence * 2) {
    recommendations.push({
      type: 'optimization',
      message: 'High influence concentration detected. Consider distributing influence across more events.',
      priority: 'medium'
    });
  }
  
  if (analysis.distribution.low > analysis.distribution.high + analysis.distribution.medium) {
    recommendations.push({
      type: 'efficiency',
      message: 'Many events have low influence. Consider consolidating or removing low-impact events.',
      priority: 'low'
    });
  }
  
  return recommendations;
}

function generateGlobalInfluenceRecommendations(analysis) {
  const recommendations = [];
  
  if (analysis.influenceDistribution.high < analysis.totalEvents * 0.1) {
    recommendations.push({
      type: 'strategy',
      message: 'Few high-influence events detected. Consider identifying and strengthening key events.',
      priority: 'high'
    });
  }
  
  if (analysis.influenceDistribution.low > analysis.totalEvents * 0.5) {
    recommendations.push({
      type: 'optimization',
      message: 'Many low-influence events detected. Consider event consolidation or removal.',
      priority: 'medium'
    });
  }
  
  return recommendations;
}

function generateSimulationRecommendations(original, newInfluence) {
  const recommendations = [];
  const change = newInfluence.totalInfluence - original.totalInfluence;
  const changePercentage = (change / original.totalInfluence) * 100;
  
  if (changePercentage > 20) {
    recommendations.push({
      type: 'impact',
      message: `Significant positive influence increase (${changePercentage.toFixed(1)}%). This change has strong positive impact.`,
      priority: 'high'
    });
  } else if (changePercentage < -20) {
    recommendations.push({
      type: 'warning',
      message: `Significant negative influence decrease (${changePercentage.toFixed(1)}%). Consider alternative approaches.`,
      priority: 'high'
    });
  }
  
  return recommendations;
}

function calculateVariance(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return variance;
}

module.exports = {
  calculateEventInfluence,
  performGlobalAnalysis,
  simulateInfluenceChanges,
  getInfluenceNetwork
};

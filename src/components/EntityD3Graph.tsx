import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Sparkles, Info, Maximize2, RotateCcw } from 'lucide-react';

interface EntityNode {
  id: string;
  name: string;
  type: string;
  description: string;
}

interface EntityRelation {
  source: string;
  relation: string;
  target: string;
}

interface EntityD3GraphProps {
  entities: EntityNode[];
  relations: EntityRelation[];
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: string;
  description: string;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
  relation: string;
}

export const EntityD3Graph: React.FC<EntityD3GraphProps> = ({ entities, relations }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<EntityNode | null>(null);
  const [zoomFactor, setZoomFactor] = useState<number>(1);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || entities.length === 0) return;

    // Clear previous SVG content
    d3.select(svgRef.current).selectAll('*').remove();

    // Dimensions
    const width = containerRef.current.clientWidth || 600;
    const height = 400;

    const svg = d3.select(svgRef.current)
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('background', '#0b0d16')
      .style('border-radius', '16px');

    // Root group for zooming
    const container = svg.append('g').attr('class', 'graph-container');

    // Zooming behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
        setZoomFactor(Math.round(event.transform.k * 100));
      });

    svg.call(zoomBehavior);

    // Prepare nodes and links
    // Map ids/names to ensure matching is robust (some relations map on .id or .name)
    const entityMap = new Map<string, EntityNode>();
    entities.forEach(e => {
      entityMap.set(e.id.toLowerCase(), e);
      entityMap.set(e.name.toLowerCase(), e);
    });

    const nodes: D3Node[] = entities.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      description: e.description,
      x: Math.random() * width,
      y: Math.random() * height
    }));

    const links: D3Link[] = [];
    relations.forEach(r => {
      const srcNode = entityMap.get(r.source.toLowerCase());
      const tgtNode = entityMap.get(r.target.toLowerCase());
      
      if (srcNode && tgtNode) {
        links.push({
          source: srcNode.id,
          target: tgtNode.id,
          relation: r.relation
        });
      }
    });

    // Setup arrow markers for relation directions
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22) // distance from node center to tip
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#4f46e5');

    // Setup force simulation
    const simulation = d3.forceSimulation<D3Node>(nodes)
      .force('link', d3.forceLink<D3Node, D3Link>(links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(25));

    // Render group links
    const linkGroup = container.append('g')
      .attr('class', 'links');

    const link = linkGroup.selectAll('.link-group')
      .data(links)
      .enter()
      .append('g')
      .attr('class', 'link-group');

    // Draw lines
    const line = link.append('line')
      .attr('stroke', '#312e81')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrow)');

    // Draw relation texts
    const label = link.append('text')
      .attr('text-anchor', 'middle')
      .attr('fill', '#818cf8')
      .style('font-size', '9px')
      .style('font-family', 'var(--font-mono, monospace)')
      .style('pointer-events', 'none')
      .text(d => d.relation);

    // Node colors helper
    const getNodeColor = (type: string) => {
      const t = type?.toLowerCase() || '';
      if (t.includes('disease') || t.includes('patient') || t.includes('medical') || t.includes('طبي') || t.includes('مرض')) return '#2dd4bf'; // Teal
      if (t.includes('gene') || t.includes('scientific') || t.includes('علمي') || t.includes('protein')) return '#3b82f6'; // Blue / Indigo
      if (t.includes('organization') || t.includes('person') || t.includes('document')) return '#f59e0b'; // Amber
      return '#818cf8'; // Default indigo-purple
    };

    // Render node groups
    const nodeGroup = container.append('g')
      .attr('class', 'nodes');

    const node = nodeGroup.selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(d3.drag<SVGGElement, D3Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      )
      .on('click', (event, d) => {
        setSelectedNode({ id: d.id, name: d.name, type: d.type, description: d.description });
      });

    // Draw circles representing entities
    node.append('circle')
      .attr('r', 12)
      .attr('fill', d => getNodeColor(d.type))
      .attr('stroke', '#1e1b4b')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .style('transition', 'r 0.1s ease')
      .on('mouseover', function() {
        d3.select(this).attr('r', 15).attr('stroke', '#ffffff');
      })
      .on('mouseout', function() {
        d3.select(this).attr('r', 12).attr('stroke', '#1e1b4b');
      });

    // Draw entity name labels
    node.append('text')
      .attr('dy', 25)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e2e8f0')
      .style('font-size', '10px')
      .style('font-weight', 'bold')
      .style('pointer-events', 'none')
      .text(d => d.name);

    // Update positions on tick
    simulation.on('tick', () => {
      // Line edges
      line
        .attr('x1', d => (d.source as D3Node).x || 0)
        .attr('y1', d => (d.source as D3Node).y || 0)
        .attr('x2', d => (d.target as D3Node).x || 0)
        .attr('y2', d => (d.target as D3Node).y || 0);

      // Labels on links
      label
        .attr('x', d => {
          const s = d.source as D3Node;
          const t = d.target as D3Node;
          return ((s.x || 0) + (t.x || 0)) / 2;
        })
        .attr('y', d => {
          const s = d.source as D3Node;
          const t = d.target as D3Node;
          return ((s.y || 0) + (t.y || 0)) / 2 - 4;
        });

      // Nodes
      node
        .attr('transform', d => `translate(${d.x || 0}, ${d.y || 0})`);
    });

    // Drag helper functions
    function dragstarted(event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Default trigger first node click if none selected
    if (nodes.length > 0 && !selectedNode) {
      setSelectedNode({ id: nodes[0].id, name: nodes[0].name, type: nodes[0].type, description: nodes[0].description });
    }

    // Free resources on unmount
    return () => {
      simulation.stop();
    };
  }, [entities, relations]);

  const resetZoom = () => {
    if (!svgRef.current) return;
    d3.select(svgRef.current).transition().duration(500).call(
      d3.zoom<SVGSVGElement, unknown>().transform as any,
      d3.zoomIdentity
    );
  };

  return (
    <div className="bg-[#11141e] border border-gray-850 p-5 rounded-2xl space-y-4 text-right" ref={containerRef}>
      <div className="flex items-center justify-between border-b border-gray-800 pb-3">
        <h4 className="text-xs font-black tracking-wider text-teal-400 uppercase flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <span>المستكشف التفاعلي للكيانات والشبكة (D3.js Graph Visualizer)</span>
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono bg-[#0d0f17] border border-gray-800 px-2 py-0.5 rounded text-gray-400">
            التقريب: {zoomFactor}%
          </span>
          <button 
            type="button" 
            onClick={resetZoom}
            className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition"
            title="إعادة تعيين التقريب"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        تحرّك واسحب الكتل الدائرية لفهم الروابط المعرفية. استمر في التمرير للتقريب/تبعيد المشهد. اضغط على أي كيان مرمز لإظهار الخصائص الدلالية الكاملة.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* SVG Visualization Canvas */}
        <div className="lg:col-span-2 relative border border-gray-900 rounded-2xl overflow-hidden shadow-inner">
          <svg ref={svgRef} className="w-full h-[400px]" />
          <div className="absolute bottom-3 right-3 flex gap-2 text-[9px] font-mono bg-[#0d0f17]/80 backdrop-blur border border-gray-900 p-2 rounded-lg">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#2dd4bf]" /> طبي</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]" /> علمي</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" /> توثيقي</span>
          </div>
        </div>

        {/* Selected entity details panel */}
        <div className="bg-[#0b0d16] border border-gray-900 p-4 rounded-2xl flex flex-col justify-between h-[400px]">
          <div>
            <div className="flex items-center gap-1.5 border-b border-gray-800 pb-2 mb-3 text-xs font-bold text-gray-300">
              <Info className="w-3.5 h-3.5 text-indigo-400" />
              <span>مستكشف السمات اللغوية</span>
            </div>
            
            {selectedNode ? (
              <div className="space-y-4">
                <div>
                  <span className="text-[9px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-900 px-1.5 py-0.5 rounded font-bold uppercase">
                    {selectedNode.type}
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono block mt-1.5">معرف الكيان الرقمي: {selectedNode.id}</span>
                  <h4 className="text-sm font-black text-white mt-1">{selectedNode.name}</h4>
                </div>

                <div className="bg-[#121522] border border-indigo-950 p-3 rounded-xl">
                  <span className="text-[10px] text-indigo-400 font-bold block mb-1">الوصف الدلالي:</span>
                  <p className="text-[11px] text-gray-300 leading-relaxed text-right">{selectedNode.description || 'لا يوجد وصف مدمج مصاحب.'}</p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 py-12">
                <Maximize2 className="w-8 h-8 opacity-20 mb-2" />
                <p className="text-xs">اضغط على أي عقدة في الرسم البياني لعرض خصائصها الكاملة.</p>
              </div>
            )}
          </div>
          
          {selectedNode && (
            <div className="text-[9px] text-gray-500 border-t border-gray-900 pt-3">
              * تم الاستخلاص دلالياً تفعيلاً للباب السادس من دستور الجودة.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

#!/usr/bin/env python3
"""
LangGraph Architecture Diagram Generator
Creates a visual representation of the ThinkingCindyAgent workflow
"""

import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyBboxPatch, ConnectionPatch
import numpy as np

def create_langgraph_diagram():
    # Create figure and axis
    fig, ax = plt.subplots(1, 1, figsize=(16, 12))
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 12)
    ax.axis('off')
    
    # Colors
    colors = {
        'input': '#E3F2FD',
        'analyze': '#FFECB3', 
        'think': '#F3E5F5',
        'tools': '#E8F5E8',
        'synthesize': '#FFF3E0',
        'output': '#FAFAFA',
        'arrow': '#666666',
        'text': '#333333'
    }
    
    # Title
    ax.text(8, 11.5, 'ThinkingCindyAgent - LangGraph Architecture', 
            fontsize=20, fontweight='bold', ha='center', color=colors['text'])
    
    # Phase 1: Input Analysis
    input_box = FancyBboxPatch((1, 9.5), 3, 1.2, 
                               boxstyle="round,pad=0.1", 
                               facecolor=colors['input'], 
                               edgecolor='black', linewidth=2)
    ax.add_patch(input_box)
    ax.text(2.5, 10.1, 'PHASE 1: INPUT', fontsize=12, fontweight='bold', ha='center')
    ax.text(2.5, 9.8, 'analyzeInput()', fontsize=10, ha='center', style='italic')
    ax.text(2.5, 9.6, '• Parse hashtags\n• Extract clean input\n• Identify forced tools', 
            fontsize=9, ha='center', va='center')
    
    # Phase 2: Thinking & Planning
    think_box = FancyBboxPatch((6, 9.5), 3, 1.2, 
                               boxstyle="round,pad=0.1", 
                               facecolor=colors['think'], 
                               edgecolor='black', linewidth=2)
    ax.add_patch(think_box)
    ax.text(7.5, 10.1, 'PHASE 2: THINKING', fontsize=12, fontweight='bold', ha='center')
    ax.text(7.5, 9.8, 'createThinkingPlan()', fontsize=10, ha='center', style='italic')
    ax.text(7.5, 9.6, '• LLM planning call\n• Tool suggestion\n• Create execution plan', 
            fontsize=9, ha='center', va='center')
    
    # Phase 3: Tool Execution
    tools_box = FancyBboxPatch((11, 9.5), 3, 1.2, 
                               boxstyle="round,pad=0.1", 
                               facecolor=colors['tools'], 
                               edgecolor='black', linewidth=2)
    ax.add_patch(tools_box)
    ax.text(12.5, 10.1, 'PHASE 3: TOOLS', fontsize=12, fontweight='bold', ha='center')
    ax.text(12.5, 9.8, 'executeTools()', fontsize=10, ha='center', style='italic')
    ax.text(12.5, 9.6, '• Run planned tools\n• Collect results\n• Handle errors', 
            fontsize=9, ha='center', va='center')
    
    # Phase 4: Synthesis
    synth_box = FancyBboxPatch((6, 7.5), 3, 1.2, 
                               boxstyle="round,pad=0.1", 
                               facecolor=colors['synthesize'], 
                               edgecolor='black', linewidth=2)
    ax.add_patch(synth_box)
    ax.text(7.5, 8.1, 'PHASE 4: SYNTHESIS', fontsize=12, fontweight='bold', ha='center')
    ax.text(7.5, 7.8, 'synthesizeResponse()', fontsize=10, ha='center', style='italic')
    ax.text(7.5, 7.6, '• Final LLM call\n• Combine tool results\n• Generate citations', 
            fontsize=9, ha='center', va='center')
    
    # Available Tools Section
    tools_section = FancyBboxPatch((1, 5.5), 6, 1.5, 
                                   boxstyle="round,pad=0.1", 
                                   facecolor='#F5F5F5', 
                                   edgecolor='black', linewidth=1)
    ax.add_patch(tools_section)
    ax.text(4, 6.8, 'AVAILABLE TOOLS', fontsize=12, fontweight='bold', ha='center')
    ax.text(2, 6.4, '• search_documents', fontsize=10, ha='left')
    ax.text(2, 6.1, '• read_file', fontsize=10, ha='left')
    ax.text(2, 5.8, '• write_file', fontsize=10, ha='left')
    ax.text(4.5, 6.4, '• web_search', fontsize=10, ha='left')
    ax.text(4.5, 6.1, '• brave_search', fontsize=10, ha='left')
    ax.text(4.5, 5.8, '• list_directory', fontsize=10, ha='left')
    
    # Hashtag System
    hashtag_section = FancyBboxPatch((9, 5.5), 6, 1.5, 
                                     boxstyle="round,pad=0.1", 
                                     facecolor='#FFF9C4', 
                                     edgecolor='black', linewidth=1)
    ax.add_patch(hashtag_section)
    ax.text(12, 6.8, 'HASHTAG TOOL FORCING', fontsize=12, fontweight='bold', ha='center')
    ax.text(10, 6.4, '#search → search_documents', fontsize=10, ha='left')
    ax.text(10, 6.1, '#read → read_file', fontsize=10, ha='left')
    ax.text(10, 5.8, '#web → web_search_preferred', fontsize=10, ha='left')
    ax.text(13, 6.4, '#write → write_file', fontsize=10, ha='left')
    ax.text(13, 6.1, '#brave → brave_search', fontsize=10, ha='left')
    ax.text(13, 5.8, '#dir → list_directory', fontsize=10, ha='left')
    
    # Streaming Process
    stream_box = FancyBboxPatch((1, 3.5), 14, 1.5, 
                                boxstyle="round,pad=0.1", 
                                facecolor='#E1F5FE', 
                                edgecolor='blue', linewidth=2)
    ax.add_patch(stream_box)
    ax.text(8, 4.7, 'STREAMING PROCESS (processStreaming)', fontsize=14, fontweight='bold', ha='center')
    ax.text(2, 4.3, '<think> blocks', fontsize=10, ha='left', bbox=dict(boxstyle="round,pad=0.3", facecolor='white'))
    ax.text(5, 4.3, '<tool> execution', fontsize=10, ha='left', bbox=dict(boxstyle="round,pad=0.3", facecolor='white'))
    ax.text(8.5, 4.3, 'Real-time progress', fontsize=10, ha='left', bbox=dict(boxstyle="round,pad=0.3", facecolor='white'))
    ax.text(12, 4.3, 'Structured output', fontsize=10, ha='left', bbox=dict(boxstyle="round,pad=0.3", facecolor='white'))
    ax.text(8, 3.8, 'Emits structured tokens for UI rendering: thinking blocks, tool calls, progress updates', 
            fontsize=10, ha='center', style='italic')
    
    # LLM Calls
    llm_calls = FancyBboxPatch((1, 1.5), 14, 1.5, 
                               boxstyle="round,pad=0.1", 
                               facecolor='#FCE4EC', 
                               edgecolor='purple', linewidth=2)
    ax.add_patch(llm_calls)
    ax.text(8, 2.7, 'LLM INTEGRATION POINTS', fontsize=14, fontweight='bold', ha='center')
    ax.text(3, 2.3, '1. Planning Call', fontsize=11, ha='center', bbox=dict(boxstyle="round,pad=0.3", facecolor='white'))
    ax.text(3, 2.0, 'createThinkingPlan()', fontsize=9, ha='center', style='italic')
    ax.text(8, 2.3, '2. Direct Response', fontsize=11, ha='center', bbox=dict(boxstyle="round,pad=0.3", facecolor='white'))
    ax.text(8, 2.0, 'Simple greetings', fontsize=9, ha='center', style='italic')
    ax.text(13, 2.3, '3. Synthesis Call', fontsize=11, ha='center', bbox=dict(boxstyle="round,pad=0.3", facecolor='white'))
    ax.text(13, 2.0, 'synthesizeResponse()', fontsize=9, ha='center', style='italic')
    ax.text(8, 1.7, 'Smart routing: Simple greetings = 1 call | Complex requests = 2 calls', 
            fontsize=10, ha='center', style='italic', color='purple')
    
    # Arrows showing flow
    # Phase 1 to Phase 2
    arrow1 = ConnectionPatch((4, 10.1), (6, 10.1), "data", "data",
                           arrowstyle="->", shrinkA=5, shrinkB=5, mutation_scale=20, fc=colors['arrow'])
    ax.add_patch(arrow1)
    
    # Phase 2 to Phase 3
    arrow2 = ConnectionPatch((9, 10.1), (11, 10.1), "data", "data",
                           arrowstyle="->", shrinkA=5, shrinkB=5, mutation_scale=20, fc=colors['arrow'])
    ax.add_patch(arrow2)
    
    # Phase 3 to Phase 4
    arrow3 = ConnectionPatch((12.5, 9.5), (7.5, 8.7), "data", "data",
                           arrowstyle="->", shrinkA=5, shrinkB=5, mutation_scale=20, fc=colors['arrow'])
    ax.add_patch(arrow3)
    
    # Tools to Phase 3
    arrow4 = ConnectionPatch((4, 5.5), (12.5, 9.5), "data", "data",
                           arrowstyle="->", shrinkA=5, shrinkB=5, mutation_scale=15, fc='green', alpha=0.7)
    ax.add_patch(arrow4)
    
    # Hashtags to Phase 1
    arrow5 = ConnectionPatch((12, 5.5), (2.5, 9.5), "data", "data",
                           arrowstyle="->", shrinkA=5, shrinkB=5, mutation_scale=15, fc='orange', alpha=0.7)
    ax.add_patch(arrow5)
    
    # Footer
    ax.text(8, 0.5, 'ThinkingCindyAgent: Multi-phase AI reasoning with tool execution and streaming output', 
            fontsize=12, ha='center', style='italic', color='gray')
    
    plt.tight_layout()
    plt.savefig('/Users/karwo09/code/voice-assistant/langgraph_architecture.png', 
                dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    
    print("✅ LangGraph architecture diagram saved as 'langgraph_architecture.png'")

if __name__ == "__main__":
    create_langgraph_diagram()
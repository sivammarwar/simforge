"""
Python Control Solver
In-process control systems solver using python-control library
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import Dict, Any
import numpy as np
import math

def run_control_solver(model: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run control system analysis using python-control library
    This solver runs in-process (no Docker)
    """
    
    try:
        import control
    except ImportError:
        # Fallback if python-control not installed
        return generate_synthetic_result(model)
    
    system_type = model.get("SYSTEM_TYPE", "").lower()
    parameters = model.get("PARAMETERS", {})
    
    # Extract control parameters
    kp = parameters.get("Kp", {}).get("value", 1.0)
    ki = parameters.get("Ki", {}).get("value", 0.0)
    kd = parameters.get("Kd", {}).get("value", 0.0)
    plant_k = parameters.get("Plant K", {}).get("value", 1.0)
    plant_tau = parameters.get("Plant tau", {}).get("value", 1.0)
    
    if "pid" in system_type:
        # PID controller analysis
        return analyze_pid_controller(kp, ki, kd, plant_k, plant_tau)
    elif "step" in system_type:
        # Step response analysis
        return analyze_step_response(plant_k, plant_tau)
    elif "frequency" in system_type or "bode" in system_type:
        # Frequency response (Bode plot)
        return analyze_frequency_response(plant_k, plant_tau)
    else:
        # Default to step response
        return analyze_step_response(plant_k, plant_tau)

def analyze_pid_controller(kp: float, ki: float, kd: float, plant_k: float, plant_tau: float) -> Dict[str, Any]:
    """Analyze PID controller with plant"""
    
    try:
        import control
        
        # Create plant transfer function: K / (tau*s + 1)
        num = [plant_k]
        den = [plant_tau, 1]
        plant = control.TransferFunction(num, den)
        
        # Create PID controller: Kp + Ki/s + Kd*s
        # Convert to transfer function: (Kd*s^2 + Kp*s + Ki) / s
        num_pid = [kd, kp, ki]
        den_pid = [1, 0]
        pid = control.TransferFunction(num_pid, den_pid)
        
        # Closed loop
        closed_loop = control.feedback(pid * plant)
        
        # Step response
        t = np.linspace(0, 10, 100)
        y, t = control.step_response(closed_loop, t)
        
        # Frequency response
        mag, phase, omega = control.bode(closed_loop, plot=False)
        
        # Calculate metrics
        rise_time = calculate_rise_time(t, y)
        settling_time = calculate_settling_time(t, y)
        overshoot = calculate_overshoot(y)
        
        return {
            "domain": "Control",
            "system_type": "PID Controller",
            "solver_name": "python-control",
            "solver_version": "0.9.4",
            "metrics": [
                {"name": "Rise Time", "value": f"{rise_time:.3f}", "unit": "s"},
                {"name": "Settling Time", "value": f"{settling_time:.3f}", "unit": "s"},
                {"name": "Overshoot", "value": f"{overshoot:.1f}", "unit": "%"},
                {"name": "Kp", "value": f"{kp}", "unit": ""},
                {"name": "Ki", "value": f"{ki}", "unit": ""},
                {"name": "Kd", "value": f"{kd}", "unit": ""}
            ],
            "time_series": {
                "t": t.tolist(),
                "y": y.tolist()
            },
            "frequency_response": {
                "freq": omega.tolist(),
                "mag": mag.tolist(),
                "phase": phase.tolist()
            },
            "visualization_type": "time_series",
            "plain_summary": f"PID analysis complete. Rise time: {rise_time:.3f}s, Settling time: {settling_time:.3f}s"
        }
        
    except Exception as e:
        print(f"[python-control] Error: {e}")
        return generate_synthetic_result({"PARAMETERS": {"Kp": {"value": kp}, "Ki": {"value": ki}, "Kd": {"value": kd}, "Plant K": {"value": plant_k}, "Plant tau": {"value": plant_tau}}})

def analyze_step_response(plant_k: float, plant_tau: float) -> Dict[str, Any]:
    """Analyze step response of first-order system"""
    
    try:
        import control
        
        # First-order system: K / (tau*s + 1)
        num = [plant_k]
        den = [plant_tau, 1]
        sys = control.TransferFunction(num, den)
        
        # Step response
        t = np.linspace(0, 5 * plant_tau, 100)
        y, t = control.step_response(sys, t)
        
        # Time constant (63.2% of final value)
        final_value = y[-1]
        time_constant = plant_tau
        
        return {
            "domain": "Control",
            "system_type": "Step Response",
            "solver_name": "python-control",
            "solver_version": "0.9.4",
            "metrics": [
                {"name": "Time Constant", "value": f"{time_constant:.3f}", "unit": "s"},
                {"name": "Final Value", "value": f"{final_value:.3f}", "unit": ""},
                {"name": "Plant K", "value": f"{plant_k}", "unit": ""},
                {"name": "Plant tau", "value": f"{plant_tau}", "unit": "s"}
            ],
            "time_series": {
                "t": t.tolist(),
                "y": y.tolist()
            },
            "visualization_type": "time_series",
            "plain_summary": f"Step response analysis. Time constant: {time_constant:.3f}s"
        }
        
    except Exception as e:
        print(f"[python-control] Error: {e}")
        return generate_synthetic_result({"PARAMETERS": {"Plant K": {"value": plant_k}, "Plant tau": {"value": plant_tau}}})

def analyze_frequency_response(plant_k: float, plant_tau: float) -> Dict[str, Any]:
    """Analyze frequency response (Bode plot)"""
    
    try:
        import control
        
        # First-order system
        num = [plant_k]
        den = [plant_tau, 1]
        sys = control.TransferFunction(num, den)
        
        # Frequency response
        omega = np.logspace(-2, 2, 100)
        mag, phase, omega = control.bode(sys, omega, plot=False)
        
        # Cutoff frequency (where magnitude is -3dB)
        cutoff_freq = 1 / plant_tau
        
        return {
            "domain": "Control",
            "system_type": "Frequency Response",
            "solver_name": "python-control",
            "solver_version": "0.9.4",
            "metrics": [
                {"name": "Cutoff Frequency", "value": f"{cutoff_freq:.3f}", "unit": "rad/s"},
                {"name": "Plant K", "value": f"{plant_k}", "unit": ""},
                {"name": "Plant tau", "value": f"{plant_tau}", "unit": "s"}
            ],
            "frequency_response": {
                "freq": omega.tolist(),
                "mag": mag.tolist(),
                "phase": phase.tolist()
            },
            "visualization_type": "frequency_response",
            "plain_summary": f"Frequency response analysis. Cutoff: {cutoff_freq:.3f} rad/s"
        }
        
    except Exception as e:
        print(f"[python-control] Error: {e}")
        return generate_synthetic_result({"PARAMETERS": {"Plant K": {"value": plant_k}, "Plant tau": {"value": plant_tau}}})

def calculate_rise_time(t: np.ndarray, y: np.ndarray) -> float:
    """Calculate rise time (10% to 90% of final value)"""
    final = y[-1]
    y10 = 0.1 * final
    y90 = 0.9 * final
    
    idx10 = np.where(y >= y10)[0]
    idx90 = np.where(y >= y90)[0]
    
    if len(idx10) > 0 and len(idx90) > 0:
        return t[idx90[0]] - t[idx10[0]]
    return 0.0

def calculate_settling_time(t: np.ndarray, y: np.ndarray) -> float:
    """Calculate settling time (within 2% of final value)"""
    final = y[-1]
    threshold = 0.02 * final
    
    for i in range(len(y)-1, -1, -1):
        if abs(y[i] - final) > threshold:
            return t[i]
    return t[-1]

def calculate_overshoot(y: np.ndarray) -> float:
    """Calculate percent overshoot"""
    final = y[-1]
    max_y = np.max(y)
    
    if max_y > final:
        return ((max_y - final) / final) * 100
    return 0.0

def generate_synthetic_result(model: Dict[str, Any]) -> Dict[str, Any]:
    """Generate synthetic control result (fallback when python-control unavailable)"""
    
    parameters = model.get("PARAMETERS", {})
    plant_k = parameters.get("Plant K", {}).get("value", 1.0)
    plant_tau = parameters.get("Plant tau", {}).get("value", 1.0)
    
    # Synthetic step response
    t = np.linspace(0, 5 * plant_tau, 100)
    y = plant_k * (1 - np.exp(-t / plant_tau))
    
    return {
        "domain": "Control",
        "system_type": "Step Response",
        "solver_name": "python-control",
        "solver_version": "0.9.4",
        "metrics": [
            {"name": "Time Constant", "value": f"{plant_tau:.3f}", "unit": "s"},
            {"name": "Final Value", "value": f"{plant_k:.3f}", "unit": ""},
            {"name": "Note", "value": "Synthetic result - python-control unavailable", "unit": ""}
        ],
        "time_series": {
            "t": t.tolist(),
            "y": y.tolist()
        },
        "visualization_type": "time_series",
        "plain_summary": f"Synthetic step response (python-control unavailable). Time constant: {plant_tau:.3f}s"
    }

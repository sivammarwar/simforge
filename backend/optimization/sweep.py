"""
Parameter Sweep Optimization Module
Supports multi-parameter sweeps for design space exploration
"""

from typing import List, Dict, Any, Tuple
import numpy as np
from dataclasses import dataclass


@dataclass
class SweepParameter:
    """Parameter to sweep"""
    name: str
    min_value: float
    max_value: float
    num_points: int
    scale: str = 'linear'  # 'linear' or 'log'


@dataclass
class SweepResult:
    """Result of a single sweep point"""
    parameters: Dict[str, float]
    metrics: Dict[str, float]
    status: str = 'completed'


def generate_sweep_points(parameters: List[SweepParameter]) -> List[Dict[str, float]]:
    """
    Generate parameter combinations for sweep
    
    Args:
        parameters: List of SweepParameter objects
        
    Returns:
        List of parameter dictionaries
    """
    if not parameters:
        return [{}]
    
    # Generate values for each parameter
    param_values = []
    for param in parameters:
        if param.scale == 'log':
            values = np.logspace(
                np.log10(param.min_value),
                np.log10(param.max_value),
                param.num_points
            )
        else:
            values = np.linspace(param.min_value, param.max_value, param.num_points)
        param_values.append(values)
    
    # Generate all combinations (Cartesian product)
    mesh = np.meshgrid(*param_values, indexing='ij')
    combinations = []
    
    for i in range(len(parameters)):
        param_mesh = mesh[i].flatten()
        combinations.append(param_mesh)
    
    # Transpose to get list of parameter sets
    combinations = np.array(combinations).T
    
    # Convert to list of dictionaries
    result = []
    for combo in combinations:
        param_dict = {}
        for j, param in enumerate(parameters):
            param_dict[param.name] = float(combo[j])
        result.append(param_dict)
    
    return result


def run_parameter_sweep(
    model: Dict[str, Any],
    sweep_parameters: List[SweepParameter],
    solver_func: callable,
    metric_names: List[str]
) -> Tuple[List[SweepResult], Dict[str, Any]]:
    """
    Run parameter sweep
    
    Args:
        model: Base model dictionary
        sweep_parameters: Parameters to sweep
        solver_func: Solver function that takes model and returns result
        metric_names: Names of metrics to extract from results
        
    Returns:
        Tuple of (sweep_results, summary_statistics)
    """
    # Generate sweep points
    sweep_points = generate_sweep_points(sweep_parameters)
    
    # Run solver at each point
    results = []
    for params in sweep_points:
        # Update model with sweep parameters
        sweep_model = model.copy()
        
        # Apply parameters to model (simplified - assumes flat structure)
        for param_name, param_value in params.items():
            # Try to find and update parameter in model
            for section in ['COMPONENTS', 'INPUT', 'OUTPUT', 'GEOMETRY', 'MATERIAL']:
                if section in sweep_model and param_name in sweep_model[section]:
                    sweep_model[section][param_name] = param_value
                    break
        
        try:
            # Run solver
            result = solver_func(sweep_model)
            
            # Extract metrics
            metrics = {}
            if hasattr(result, 'metrics'):
                for metric in result.metrics:
                    if metric.name in metric_names:
                        metrics[metric.name] = metric.rawValue
            elif isinstance(result, dict) and 'metrics' in result:
                for metric in result['metrics']:
                    if metric['name'] in metric_names:
                        metrics[metric['name']] = metric.get('rawValue', metric['value'])
            
            sweep_result = SweepResult(
                parameters=params,
                metrics=metrics,
                status='completed'
            )
        except Exception as e:
            sweep_result = SweepResult(
                parameters=params,
                metrics={},
                status=f'failed: {str(e)}'
            )
        
        results.append(sweep_result)
    
    # Calculate summary statistics
    summary = calculate_sweep_summary(results, metric_names)
    
    return results, summary


def calculate_sweep_summary(
    results: List[SweepResult],
    metric_names: List[str]
) -> Dict[str, Any]:
    """
    Calculate summary statistics for sweep results
    
    Args:
        results: List of SweepResult objects
        metric_names: Names of metrics to analyze
        
    Returns:
        Dictionary of summary statistics
    """
    summary = {
        'total_points': len(results),
        'successful_points': sum(1 for r in results if r.status == 'completed'),
        'failed_points': sum(1 for r in results if r.status != 'completed'),
        'metrics': {}
    }
    
    for metric_name in metric_names:
        values = [r.metrics.get(metric_name) for r in results if r.status == 'completed' and metric_name in r.metrics]
        
        if values:
            summary['metrics'][metric_name] = {
                'min': float(np.min(values)),
                'max': float(np.max(values)),
                'mean': float(np.mean(values)),
                'std': float(np.std(values)),
                'median': float(np.median(values))
            }
        else:
            summary['metrics'][metric_name] = None
    
    return summary


def find_optimal_point(
    results: List[SweepResult],
    metric_name: str,
    minimize: bool = True
) -> SweepResult:
    """
    Find optimal point in sweep results
    
    Args:
        results: List of SweepResult objects
        metric_name: Name of metric to optimize
        minimize: If True, minimize metric; if False, maximize
        
    Returns:
        SweepResult with optimal metric value
    """
    valid_results = [r for r in results if r.status == 'completed' and metric_name in r.metrics]
    
    if not valid_results:
        return None
    
    if minimize:
        optimal = min(valid_results, key=lambda r: r.metrics[metric_name])
    else:
        optimal = max(valid_results, key=lambda r: r.metrics[metric_name])
    
    return optimal


def generate_pareto_front(
    results: List[SweepResult],
    metric_names: List[str],
    minimize: List[bool] = None
) -> List[SweepResult]:
    """
    Generate Pareto front for multi-objective optimization
    
    Args:
        results: List of SweepResult objects
        metric_names: Names of metrics to consider
        minimize: List of booleans indicating whether to minimize each metric
        
    Returns:
        List of non-dominated results (Pareto front)
    """
    if minimize is None:
        minimize = [True] * len(metric_names)
    
    valid_results = [r for r in results if r.status == 'completed']
    
    # Check if all metrics are present
    valid_results = [
        r for r in valid_results
        if all(m in r.metrics for m in metric_names)
    ]
    
    if not valid_results:
        return []
    
    pareto_front = []
    
    for result in valid_results:
        is_dominated = False
        
        for other in valid_results:
            if result == other:
                continue
            
            # Check if other dominates result
            dominates = True
            for i, metric_name in enumerate(metric_names):
                if minimize[i]:
                    if other.metrics[metric_name] > result.metrics[metric_name]:
                        dominates = False
                        break
                else:
                    if other.metrics[metric_name] < result.metrics[metric_name]:
                        dominates = False
                        break
            
            if dominates:
                is_dominated = True
                break
        
        if not is_dominated:
            pareto_front.append(result)
    
    return pareto_front


def export_sweep_to_csv(results: List[SweepResult], filename: str) -> None:
    """
    Export sweep results to CSV file
    
    Args:
        results: List of SweepResult objects
        filename: Output filename
    """
    import csv
    
    if not results:
        return
    
    # Get all parameter names and metric names
    param_names = list(results[0].parameters.keys())
    metric_names = list(results[0].metrics.keys())
    
    with open(filename, 'w', newline='') as csvfile:
        writer = csv.writer(csvfile)
        
        # Write header
        header = ['status'] + param_names + metric_names
        writer.writerow(header)
        
        # Write data
        for result in results:
            row = [result.status]
            for param_name in param_names:
                row.append(result.parameters.get(param_name, ''))
            for metric_name in metric_names:
                row.append(result.metrics.get(metric_name, ''))
            writer.writerow(row)

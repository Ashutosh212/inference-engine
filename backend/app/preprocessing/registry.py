import importlib
import inspect
import pkgutil
from pathlib import Path
from app.preprocessing.base import PreprocessingStep


class StepRegistry:
    @classmethod
    def discover_steps(cls) -> list[PreprocessingStep]:
        steps_dir = Path(__file__).parent / "steps"
        step_classes: list[type[PreprocessingStep]] = []

        for module_info in pkgutil.iter_modules([str(steps_dir)]):
            module = importlib.import_module(f"app.preprocessing.steps.{module_info.name}")
            for _, obj in inspect.getmembers(module, inspect.isclass):
                if (
                    issubclass(obj, PreprocessingStep)
                    and obj is not PreprocessingStep
                    and obj.__module__ == module.__name__
                ):
                    step_classes.append(obj)

        instances = [cls_() for cls_ in step_classes]
        return sorted(instances, key=lambda s: s.order)

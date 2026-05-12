import time
from app.preprocessing.base import PreprocessingContext, PreprocessingError, PreprocessingStep


class PreprocessingPipeline:
    def __init__(self, steps: list[PreprocessingStep], config: dict):
        self.steps = sorted(
            [s for s in steps if s.enabled],
            key=lambda s: s.order,
        )
        self.config = config

    async def run(self, raw_bytes: bytes, filename: str, content_type: str) -> PreprocessingContext:
        ctx = PreprocessingContext(
            raw_bytes=raw_bytes,
            filename=filename,
            content_type=content_type,
        )

        for step in self.steps:
            step_params = self.config.get(step.name, {})
            # Respect config-level enabled:false (overrides class default)
            if not step_params.get("enabled", True):
                continue
            start = time.perf_counter()
            try:
                ctx = await step.process(ctx, step_params)
                elapsed_ms = (time.perf_counter() - start) * 1000
                ctx.steps_completed.append(step.name)
                ctx.step_timings[step.name] = round(elapsed_ms, 2)
            except PreprocessingError:
                elapsed_ms = (time.perf_counter() - start) * 1000
                ctx.step_timings[step.name] = round(elapsed_ms, 2)
                raise
            except Exception as e:
                elapsed_ms = (time.perf_counter() - start) * 1000
                ctx.step_timings[step.name] = round(elapsed_ms, 2)
                ctx.errors.append({"step": step.name, "error": str(e)})
                if step.required:
                    raise PreprocessingError(f"Required step '{step.name}' failed: {e}")

        return ctx

    def get_pipeline_info(self) -> list[dict]:
        return [s.get_info() for s in self.steps]

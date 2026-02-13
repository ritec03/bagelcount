# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Set the working directory in the container
WORKDIR /app

# Install uv for dependency management
RUN pip install uv

# Copy the project files needed for installation
COPY pyproject.toml uv.lock ./

# Install dependencies using uv
RUN uv sync --frozen --no-install-project

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

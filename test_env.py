import sys
import os

print("sys.prefix:", sys.prefix)
print("sys.exec_prefix:", sys.exec_prefix)
print("sys.executable:", sys.executable)
print("PATH env var:", os.environ.get("PATH"))
